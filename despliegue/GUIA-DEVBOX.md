# Desplegar en el devbox (Debian/Ubuntu, Docker, detrás de Caddy)

En los ejemplos, el dominio es `jardin.tudominio.es` y la carpeta `/opt/jardin`. Cámbialos por los tuyos.

## 0. Comprobaciones

```sh
docker --version && docker compose version   # Compose v2.24 o posterior
caddy version                                 # o: docker exec <contenedor-caddy> caddy version
```

- En tu DNS, un registro `A` (y `AAAA` si usas IPv6) de `jardin.tudominio.es` a la IP pública del devbox. Si ya sirves otros sitios con Caddy, los puertos 80 y 443 ya están abiertos.
- Comprueba que el puerto 8080 está libre: `ss -ltnp | grep :8080`. Si no lo está, en el paso 3 pon otro en `PUERTO`.

## 1. Bajar el código

```sh
sudo mkdir -p /opt/jardin && sudo chown "$USER": /opt/jardin
git clone -b ccr-c877e33c-96vkme https://github.com/dmolinagarcia/miJardin.git /opt/jardin
cd /opt/jardin
```

El repositorio solo hace falta para bajar el código: la web no usa GitHub para nada. Si es privado, git te pedirá usuario y un token de GitHub como contraseña. Si fusionas la rama en `main`, quita `-b …`.

## 2. Carpeta de datos

El contenedor escribe como el usuario 1000:

```sh
mkdir -p datos && sudo chown -R 1000:1000 datos
```

## 3. Configuración

```sh
cp .env.ejemplo .env && chmod 600 .env
openssl rand -base64 18          # contraseña para el administrador
nano .env
```

Como mínimo:

```ini
PUERTO=8080
ADMIN_USUARIO=tu-usuario
ADMIN_CLAVE=la-que-ha-salido-arriba
REGISTRO_ABIERTO=si
LIMITE_PLANTAS_GRATIS=10
URL_PUBLICA=https://jardin.tudominio.es
CONFIAR_PROXY=si
COOKIE_SEGURA=si
```

`CONFIAR_PROXY=si` es seguro porque el puerto solo escucha en 127.0.0.1 y solo entra Caddy. Deja Stripe para el paso 7.

## 4. Arrancar

```sh
docker compose up -d --build
docker compose logs -f           # Ctrl+C para salir
curl -s http://127.0.0.1:8080/salud    # → ok
```

En los registros debe salir «Catálogo inicial: 3 fichas importadas» y «Creado el administrador».

## 5. Caddy

**Caddy instalado en el sistema.** Añade a `/etc/caddy/Caddyfile`:

```caddy
jardin.tudominio.es {
	encode zstd gzip
	reverse_proxy 127.0.0.1:8080
}
```

```sh
sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
```

**Caddy en un contenedor.** Desde dentro de su contenedor, `127.0.0.1` no es el devbox. Conecta los dos contenedores a la misma red:

1. Busca la red de Caddy: `docker inspect <contenedor-caddy> -f '{{json .NetworkSettings.Networks}}'`.
2. En `compose.yaml`, quita el bloque `ports:` y descomenta `networks:` (las dos partes), con el nombre de esa red.
3. `docker compose up -d`.
4. En el Caddyfile usa `reverse_proxy jardin:8080` y recarga: `docker exec <contenedor-caddy> caddy reload --config /etc/caddy/Caddyfile`.

Caddy saca el certificado solo la primera vez que alguien entra. Si falla, revisa sus registros (`journalctl -u caddy -f` o `docker logs -f <contenedor-caddy>`).

## 6. Primera entrada

1. Abre `https://jardin.tudominio.es` y entra con el administrador.
2. *Ajustes → Cambiar la contraseña*.
3. Quita `ADMIN_USUARIO` y `ADMIN_CLAVE` del `.env` (solo se usan si no hay usuarios) y aplica: `docker compose up -d`.
4. En el móvil: Chrome → menú → *Instalar app*; iPhone → Safari → *Compartir → Añadir a la pantalla de inicio*.

## 7. Stripe (pagos)

Primero en **modo de prueba**:

1. <https://dashboard.stripe.com> → activa *Modo de prueba*.
2. *Catálogo de productos → Añadir producto*: «Jardín sin límite», precio **recurrente mensual**. Copia el `price_…`.
3. *Desarrolladores → Claves de API*: copia la clave secreta `sk_test_…`.
4. *Configuración → Billing → Portal de clientes*: guarda la configuración (activa la cancelación y el cambio de método de pago).
5. *Desarrolladores → Webhooks → Añadir endpoint*:
   - URL: `https://jardin.tudominio.es/api/stripe/aviso`
   - Eventos: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
   - Copia el secreto de firma `whsec_…`.
6. En `.env`:
   ```ini
   STRIPE_CLAVE_SECRETA=sk_test_...
   STRIPE_PRECIO=price_...
   STRIPE_SECRETO_AVISOS=whsec_...
   ```
7. `docker compose up -d`.
8. Prueba: crea un usuario nuevo, añade plantas hasta el límite, suscríbete con la tarjeta `4242 4242 4242 4242` (cualquier fecha futura y CVC). En *Ajustes → Tu plan* debe salir «Suscripción activa», y en Stripe → Webhooks, los avisos con respuesta 200.

Para cobrar de verdad, repite los pasos 2 a 5 en **modo real** (las claves y los precios son distintos), cambia las tres variables y reinicia. Antes, revisa la parte legal (condiciones, privacidad, desistimiento, IVA).

## 8. Día a día

```sh
cd /opt/jardin

# Actualizar a una versión nueva
git pull && docker compose up -d --build

# Registros
docker compose logs -f --tail 100

# Usuarios y contraseñas
docker compose exec jardin node servidor/cli.js usuarios
docker compose exec jardin node servidor/cli.js clave ana

# Copia de seguridad (queda en ./datos/copias/)
docker compose exec jardin node servidor/cli.js copia
```

Copia diaria a las 3:30 con `crontab -e`:

```cron
30 3 * * * cd /opt/jardin && docker compose exec -T jardin node servidor/cli.js copia >/dev/null && find datos/copias -name '*.db' -mtime +30 -delete
```

Lleva `datos/copias/` también fuera del devbox (otro disco, un NAS, rclone…).

## Si algo falla

| Síntoma | Causa probable |
| --- | --- |
| El contenedor se reinicia sin parar y sale `SQLITE_CANTOPEN` o «permission denied» | La carpeta `datos` no es del usuario 1000 (paso 2) |
| `502` en el navegador | Caddy no llega al contenedor: mira `curl 127.0.0.1:8080/salud` o la red compartida (paso 5) |
| Entras y vuelve a pedir la contraseña | `COOKIE_SEGURA=si` pero entras por http, o falta `CONFIAR_PROXY=si` |
| «Petición rechazada: no viene de esta web» al guardar | Caddy cambia la cabecera Host. Con un `reverse_proxy` normal no pasa |
| Al pagar no vuelve a la web | `URL_PUBLICA` mal puesta |
| Stripe marca los webhooks en rojo | Revisa el `whsec_…` y que la URL termine en `/api/stripe/aviso` |
