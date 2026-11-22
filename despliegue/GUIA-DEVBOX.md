# Despliegue del jardín en la devbox

Web: **https://jardin.tudominio.es** (cambia el dominio en los pasos 3 y 4). Mismo montaje que la escape room: clon de solo lectura, contenedor sin puertos publicados detrás de `devenv-caddy`, y cron que publica lo que llega a `main`.

## Resumen

```
desarrollo ──git push──► GitHub (main) ──cron cada 10 min──► actualizar.sh ──► contenedor mijardin ──► devenv-caddy (HTTPS) ──► Internet
```

| Qué | Dónde / valor |
|---|---|
| Servidor | `devbox`, usuario `ubuntu` (en el grupo `docker`) |
| Clon del repo (solo para desplegar) | `/srv/mijardin` |
| Carpeta de despliegue | `/srv/mijardin/despliegue` |
| Repositorio | `dmolinagarcia/miJardin`, rama `main` (`JARDIN_RAMA` en `.env`), por deploy key de solo lectura (`~/.ssh/mijardin_deploy`, alias SSH `github-mijardin`) |
| Contenedor | `mijardin` (imagen `mijardin:latest`, Node 22 alpine, puerto 8080 interno, sin dependencias) |
| Puertos publicados | ninguno: solo Caddy llega al contenedor, por la red Docker compartida |
| Configuración | `despliegue/.env` (no está en git; plantilla en `.env.ejemplo`). La clave es `CADDY_NETWORK`, la red Docker de `devenv-caddy` |
| Datos | `despliegue/datos/`, montada como `/datos`: `jardin.db` (SQLite) y `copias/` |
| Proxy HTTPS | contenedor `devenv-caddy` |
| Sitio en Caddy | `/srv/dev/caddy/sites/mijardin.caddy`, copiado de `despliegue/Caddyfile.ejemplo` |
| Actualización automática | cron del usuario `ubuntu`, instalado con `despliegue/programar.sh`: actualizar cada 10 min y copia diaria a las 3:17. Registro en `~/mijardin-actualizar.log` |
| Administración | dentro de la web, pestaña *Admin* (cuentas con rol admin). En terminal: `servidor/cli.js` |
| Salud y versión | `/salud` (healthcheck de Docker) y `/version.json`. La versión es `2.0.<nº de commits>` |

## Puesta en marcha (una vez)

### 1. Deploy key y clon

```bash
ssh-keygen -t ed25519 -N '' -C 'devbox mijardin' -f ~/.ssh/mijardin_deploy
cat >> ~/.ssh/config <<'EOF'

Host github-mijardin
  HostName github.com
  User git
  IdentityFile ~/.ssh/mijardin_deploy
  IdentitiesOnly yes
EOF
cat ~/.ssh/mijardin_deploy.pub
```

En GitHub, en *miJardin → Settings → Deploy keys → Add deploy key*, pega la clave pública **sin** marcar *Allow write access*.

```bash
ssh -T github-mijardin          # «Hi dmolinagarcia/miJardin! You've successfully authenticated…»
sudo mkdir -p /srv/mijardin && sudo chown ubuntu: /srv/mijardin
git clone github-mijardin:dmolinagarcia/miJardin.git /srv/mijardin
git -C /srv/mijardin ls-remote origin main   # tiene que responder
```

### 2. Configuración

```bash
cd /srv/mijardin/despliegue
cp .env.ejemplo .env && chmod 600 .env
docker inspect devenv-caddy -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'   # → CADDY_NETWORK
openssl rand -base64 18                                                                    # → ADMIN_CLAVE
nano .env
```

Rellena `CADDY_NETWORK`, `URL_PUBLICA`, `ADMIN_USUARIO`, `ADMIN_CLAVE` y, si quieres, `LIMITE_PLANTAS_GRATIS`. Stripe se deja vacío por ahora.

### 3. Primer despliegue

```bash
./actualizar.sh --forzar
docker compose ps                        # mijardin … (healthy)
docker compose logs --tail 20 mijardin   # «Catálogo inicial: 3 fichas…», «Creado el administrador…»
```

### 4. Caddy

```bash
cp Caddyfile.ejemplo /srv/dev/caddy/sites/mijardin.caddy
nano /srv/dev/caddy/sites/mijardin.caddy   # el dominio
docker exec devenv-caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

El DNS de ese dominio tiene que apuntar a la devbox (registro `A`/`AAAA`, o `CNAME` al nombre de la devbox).

### 5. Primera entrada

1. `https://jardin.tudominio.es` → entra con el administrador → *Ajustes → Cambiar la contraseña*.
2. Quita `ADMIN_USUARIO` y `ADMIN_CLAVE` de `.env` y aplica: `./actualizar.sh --forzar`.
3. Comprueba `https://jardin.tudominio.es/version.json`.

### 6. Tareas programadas

```bash
./programar.sh          # cada 10 min + copia diaria
crontab -l | grep mijardin
```

### 7. Stripe (cuando toque)

1. En modo de prueba: producto con precio **recurrente mensual** (`price_…`), clave secreta `sk_test_…`, y guarda la configuración del *Portal de clientes*.
2. Webhook a `https://jardin.tudominio.es/api/stripe/aviso` con `checkout.session.completed` y `customer.subscription.created/updated/deleted` (`whsec_…`).
3. Rellena `STRIPE_CLAVE_SECRETA`, `STRIPE_PRECIO` y `STRIPE_SECRETO_AVISOS` en `.env` y aplica con `./actualizar.sh --forzar`.
4. Prueba con un usuario nuevo y la tarjeta `4242 4242 4242 4242`.

## Cómo se publica un cambio

1. Se fusiona o se hace push a `main` en GitHub.
2. Como mucho 10 minutos después, el cron lanza `despliegue/actualizar.sh`, que:
   1. hace una copia de la base de datos en `datos/copias/antes-<commit>-<fecha>.db`;
   2. hace `git fetch` y un `merge --ff-only` de `main`;
   3. construye la imagen pasándole la versión y el commit, y arranca el contenedor (las migraciones de la base de datos se aplican solas al iniciar);
   4. espera a que el contenedor esté `healthy`, hasta 120 s.
3. Si la imagen no se construye, el código vuelve al commit anterior y la web sigue como estaba.
4. Si la versión nueva no arranca, vuelve al commit anterior y restaura la base de datos desde la copia. Lo que se haya guardado durante el intento se pierde: son segundos.
5. En los dos casos, el commit queda marcado como fallido (`datos/.commit-fallido`) y el cron no lo reintenta hasta que llegue otro commit. Con `--forzar` se reintenta.

> El clon de `/srv/mijardin` **no se toca a mano**. Si tiene cambios locales, `actualizar.sh` se niega a actualizar. Si alguien hace `push --force` a `main`, también se para y avisa.

## Comandos habituales (en `/srv/mijardin/despliegue`)

```bash
./actualizar.sh                      # publicar ya, sin esperar al cron
./actualizar.sh --forzar             # reconstruir y reiniciar aunque no haya commits nuevos (p. ej. tras cambiar .env)
docker compose ps                    # debe salir healthy
docker compose logs --tail 100 mijardin
tail -n 50 ~/mijardin-actualizar.log
crontab -l | grep mijardin
./programar.sh 5                     # actualizar cada 5 minutos
./programar.sh --quitar
./copia.sh                           # copia de seguridad a mano (y borra las de más de 30 días)
docker exec devenv-caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile

docker compose exec mijardin node servidor/cli.js usuarios
docker compose exec mijardin node servidor/cli.js crear-usuario pepe --admin
docker compose exec -e CLAVE='nueva-clave' mijardin node servidor/cli.js clave ana
```

**Usa siempre `actualizar.sh`, no `docker compose up -d --build`.** El script calcula la versión, pone el usuario correcto para escribir en `datos/` y hace la copia de seguridad. Construyendo a mano, la web sale como `0.0.0-dev`.

## Restaurar una copia a mano

```bash
cd /srv/mijardin/despliegue
ls -lt datos/copias | head
docker compose stop mijardin
cp datos/copias/LA-COPIA.db datos/jardin.db && rm -f datos/jardin.db-wal datos/jardin.db-shm
docker compose start mijardin
```

## Incidencias posibles

| Síntoma | Causa y solución |
|---|---|
| `couldn't find remote ref main` | Aún no hay rama `main` con este código en GitHub, o `JARDIN_RAMA` apunta a otra. `git -C /srv/mijardin ls-remote origin main`. |
| `Falta CADDY_NETWORK` | Rellénalo en `.env` con la red de `devenv-caddy` (paso 2). |
| Bad gateway 502 | `mijardin` no está en la red de `CADDY_NETWORK` o no está `healthy`: `docker compose ps` y `logs`. |
| El sitio no responde tras añadirlo | El fichero no acaba en `.caddy`, no está en `/srv/dev/caddy/sites`, o falta el `caddy reload`. |
| El contenedor se reinicia con «permission denied» o `SQLITE_CANTOPEN` | `datos/` no es del usuario que despliega. `sudo chown -R ubuntu: datos` y `./actualizar.sh --forzar`. |
| Entras y vuelve a pedir la contraseña | Estás entrando por http, o Caddy no manda `X-Forwarded-Proto`. Entra por https. |
| «Petición rechazada: no viene de esta web» al guardar | El sitio de Caddy cambia la cabecera Host. Usa un `reverse_proxy` normal, como el del ejemplo. |
| Al pagar no vuelve a la web | `URL_PUBLICA` mal puesta en `.env`. |
| El cron no publica | `tail ~/mijardin-actualizar.log`. Puede ser un commit marcado como fallido (`cat datos/.commit-fallido`). Lanza `./actualizar.sh` a mano para ver el error. |

## Pendiente de confirmar en la devbox

- El dominio definitivo y su registro DNS.
- El valor de `CADDY_NETWORK` (el mismo que la escape room: `grep CADDY_NETWORK /srv/escaperoom2627/deploy/.env`).
- Que `/srv/mijardin/despliegue/datos/copias` se copie fuera de la máquina, junto con los datos de la escape room.
