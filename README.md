# Jardín

Web multiusuario para llevar el jardín, pensada para el móvil e instalable como app:

- **Temporada**: el mes de hoy (o el que elijas) con lo que pasa y lo que toca hacer en cada planta de tu jardín, y una línea del año con las épocas de todas.
- **Plano**: el contorno de tu jardín con las plantas marcadas. Se pueden mover, añadir y quitar.
- **Fichas**: el catálogo común de fichas de plantas, cada una con su calendario de tareas sobre los doce meses, y **tus notas** encima.
- **Admin** (solo administradores): el catálogo central de fichas y las cuentas de usuario.

El registro es libre. Cada cuenta puede tener **gratis hasta un número de plantas** en su plano (10 por defecto); para tener más, se paga una **suscripción mensual** con Stripe.

Funciona con un servidor Node pequeño, sin dependencias, que guarda todo en una base SQLite. No usa GitHub ni ningún servicio externo.

## Cómo se organiza

| Qué | Quién lo edita | Quién lo ve |
| --- | --- | --- |
| Ficha base de cada planta (catálogo) | Administradores, en *Admin* | Todos los usuarios |
| Notas sobre una ficha | Cada usuario, las suyas | Solo su autor |
| Jardín: plano, plantas y fichas que tiene | Cada usuario, el suyo | Solo su dueño |
| Cuentas | Cada usuario se registra; los administradores las gestionan | — |

- Cuando un administrador publica una ficha, todos ven la versión nueva al momento. Las notas de cada usuario se conservan, y en sus fichas aparece el aviso «Actualizada» hasta que la abren.
- Cada publicación es una versión nueva. Desde *Admin → Versiones* se puede ver cualquiera anterior y volver a ella.
- Archivar una ficha la oculta a los usuarios sin perder sus notas. Borrarla para siempre (solo si está archivada) se lleva también las notas.
- Las notas usan el mismo formato que las fichas: el texto libre del principio sale en un recuadro «Tus notas», y las tareas de `## Calendario` y las secciones con meses (`## Poda en mi terraza (feb–mar)`) se suman a la ficha y a *Temporada*, marcadas como tuyas.

## Instalar en el devbox

Hace falta **Node 22.13 o posterior** (trae SQLite incluido). No hay que instalar paquetes.

```sh
git clone … miJardin && cd miJardin
cp .env.ejemplo .env        # y cambia ADMIN_CLAVE
npm start
```

Abre <http://IP-DEL-DEVBOX:8080> y entra con el administrador del `.env`. La primera vez:

- el catálogo se llena con las fichas de `semillas/fichas/`;
- el administrador recibe como jardín el de `semillas/jardin.json` (el de Colmenar).

Después puedes quitar `ADMIN_USUARIO` y `ADMIN_CLAVE` del `.env`: solo se usan si no hay ningún usuario.

### Con Docker

```sh
cp .env.ejemplo .env
mkdir -p datos && sudo chown -R 1000:1000 datos
docker compose up -d --build
```

La base de datos queda en `./datos/jardin.db`. El puerto solo escucha en `127.0.0.1`: se entra a través de un proxy con https. La guía paso a paso para un devbox con Caddy está en [`despliegue/GUIA-DEVBOX.md`](despliegue/GUIA-DEVBOX.md).

### Con systemd

En `despliegue/jardin.service` hay un servicio listo para copiar en `/etc/systemd/system/` (ajusta el usuario y la ruta).

### HTTPS (necesario para instalarla como app)

Los móviles solo instalan la web como app si se sirve por **https** (o en `localhost`). Opciones:

- **Caddy** delante del servidor: `despliegue/Caddyfile` tiene la configuración. Con un dominio público, Caddy saca el certificado solo. Arranca el jardín con `CONFIAR_PROXY=si`.
- **Tailscale**: `tailscale serve --bg 8080` publica el jardín con https en tu red Tailscale (`https://devbox.tu-red.ts.net`). También con `CONFIAR_PROXY=si`.

Luego, en el móvil: en Android/Chrome, *Ajustes → La app en el móvil → Instalar la app* (o el menú del navegador). En iPhone, en Safari, *Compartir → Añadir a la pantalla de inicio*. Instalada, se abre a pantalla completa y deja consultar el jardín sin conexión (la última copia descargada).

## Plan gratuito y suscripción

- Sin pagar, una cuenta puede tener hasta `LIMITE_PLANTAS_GRATIS` plantas en el plano. Fichas, notas, calendario y todo lo demás no tienen límite.
- Al intentar pasar del límite, la web ofrece la suscripción. El pago se hace en la página de Stripe (tarjeta, Apple Pay, Google Pay…); la web no ve nunca los datos de la tarjeta.
- Desde *Ajustes → Tu plan*, el usuario ve cuántas plantas lleva y, si está suscrito, abre el portal de Stripe para cambiar la tarjeta, descargar facturas o cancelar.
- Si la suscripción termina, el usuario **conserva todas sus plantas** y puede moverlas, editarlas o quitarlas, pero no añadir más hasta volver a suscribirse.
- Si un cobro falla, Stripe lo reintenta durante unos días; mientras tanto se mantiene el acceso y se avisa al usuario.
- Los administradores no tienen límite, y en *Admin → Usuarios → Editar* pueden dar plantas sin límite a cualquiera sin que pague (familia, pruebas…).
- El servidor comprueba el límite al guardar: no se puede saltar desde el navegador.

### Poner en marcha Stripe

1. Crea una cuenta en <https://dashboard.stripe.com>. Empieza en **modo de prueba** (claves `sk_test_…`) y paga con la tarjeta `4242 4242 4242 4242`.
2. En *Catálogo de productos*, crea un producto («Jardín sin límite») con un **precio recurrente mensual**. Copia su identificador `price_…` a `STRIPE_PRECIO`.
3. En *Desarrolladores → Claves de API*, copia la clave secreta a `STRIPE_CLAVE_SECRETA`.
4. En *Configuración → Billing → Portal de clientes*, guarda la configuración del portal (permite cancelar y actualizar el método de pago). Sin esto, el botón «Gestionar la suscripción» falla.
5. Recomendado: en *Desarrolladores → Webhooks*, añade el endpoint `https://TU-DOMINIO/api/stripe/aviso` con los eventos `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated` y `customer.subscription.deleted`. Copia su secreto `whsec_…` a `STRIPE_SECRETO_AVISOS`.
6. Pon `URL_PUBLICA` con la dirección https de la web y reinicia.

El webhook necesita que Stripe pueda llegar al servidor desde internet. Si el devbox solo es accesible en tu red (por ejemplo con `tailscale serve`), puedes dejarlo sin webhook: la web pregunta a Stripe por la suscripción al volver del pago y, como mucho, cada 6 horas cuando el usuario la abre, así que las renovaciones y cancelaciones se acaban reflejando igual. Con Tailscale también puedes publicar solo esa dirección con `tailscale funnel`.

Para probar los webhooks en local: `stripe listen --forward-to localhost:8080/api/stripe/aviso` (con la CLI de Stripe), que te da un `whsec_…` temporal.

**Antes de cobrar de verdad**: vender suscripciones en España/UE exige mostrar condiciones de contratación, política de privacidad e información sobre el desistimiento, y declarar el IVA (Stripe Tax lo puede calcular con `STRIPE_IMPUESTOS=si`). Consúltalo con tu gestoría.

## Variables de entorno

| Variable | Por defecto | Para qué |
| --- | --- | --- |
| `PUERTO` | `8080` | Puerto del servidor |
| `HOST` | `0.0.0.0` | Interfaz en la que escucha (`127.0.0.1` si solo entra el proxy) |
| `DATOS` | `./datos` | Carpeta de `jardin.db` |
| `ADMIN_USUARIO`, `ADMIN_CLAVE` | — | Primer administrador, si no hay usuarios |
| `REGISTRO_ABIERTO` | `si` | Si cualquiera puede crearse una cuenta desde la pantalla de entrada |
| `LIMITE_PLANTAS_GRATIS` | `10` | Plantas en el plano sin pagar |
| `URL_PUBLICA` | — | Dirección pública, para volver desde el pago |
| `STRIPE_CLAVE_SECRETA` | — | Clave secreta de Stripe; sin ella, sin pagos |
| `STRIPE_PRECIO` | — | Precio mensual (`price_…`) |
| `STRIPE_SECRETO_AVISOS` | — | Secreto del webhook (`whsec_…`) |
| `STRIPE_IMPUESTOS` | `no` | Calcular el IVA con Stripe Tax |
| `PRECIO_TEXTO` | — | Texto del precio; si no, se pregunta a Stripe |
| `CONFIAR_PROXY` | `no` | Leer `X-Forwarded-*` (IP real, https) de un proxy |
| `COOKIE_SEGURA` | `auto` | Cookie solo por https: `auto`, `si` o `no` |
| `SEMILLAS` | `./semillas` | Datos iniciales del catálogo y del jardín |

## Administración desde la terminal

```sh
npm run cli -- usuarios                              # lista de cuentas
npm run cli -- crear-usuario ana --nombre "Ana"      # pide la contraseña
npm run cli -- crear-usuario pepe --admin
npm run cli -- clave ana                             # cambia la contraseña y cierra sus sesiones
npm run cli -- importar-fichas semillas/fichas       # crea o actualiza fichas desde .md
npm run cli -- exportar-fichas copia-fichas          # vuelca el catálogo a .md
npm run cli -- importar-jardin ana mi-jardin.json    # sustituye el jardín de un usuario
```

Con Docker: `docker compose exec jardin node servidor/cli.js usuarios`.

`importar-fichas` sirve para mantener el catálogo también como archivos: edita los `.md` y vuelve a importarlos; solo crea versión nueva de las fichas que han cambiado.

## Copias de seguridad

Todo está en `datos/jardin.db`. Para copiarla en caliente:

```sh
npm run cli -- copia                                          # sin Docker
docker compose exec jardin node servidor/cli.js copia         # con Docker
```

La copia queda en `datos/copias/`.

Cada usuario puede además descargar su jardín y sus notas en *Ajustes → Descargar una copia*.

## Cómo se escribe una ficha

Cada ficha del catálogo es un texto Markdown:

```markdown
---
nombre: Granado
cientifico: Punica granatum
color: "#b0243b"
---

# Granado

Descripción general.

## Calendario

- oct–nov: Cosecha de granadas
- feb–mar: Poda suave y trasplante si hace falta
- dic–feb: Juntar las macetas contra la pared #proteccion

## Otoño (sep–nov)

Lo que pasa y lo que hay que hacer en otoño.
```

- **Los meses entre paréntesis** de cada título deciden en qué meses aparece ese texto en *Temporada*.
- **`## Calendario`** es una lista de tareas, una por línea: `- meses: texto`. Valen meses abreviados o enteros, un mes o un rango, y rangos que cruzan el año (`nov–feb`).
- **El color de cada tarea** sale de su primera palabra (Cosecha, Poda, Riego, Abonado, Heladas, Pulgón, Floración…). Para elegirlo, termina la línea con `#cosecha`, `#poda`, `#riego`, `#abono`, `#proteccion`, `#plagas`, `#flor`, `#hoja`, `#plantar` u `#otro`.
- **Los títulos sin meses**, como `## Problemas típicos`, salen solo en la ficha.

## El jardín de cada usuario

Se edita en el plano, o como JSON en *Ajustes → Editar los datos del plano*:

- `nombre`: el nombre que sale arriba.
- `fichas`: las fichas del catálogo que tiene en su jardín (las de las plantas del plano se añaden solas).
- `plano.contorno`: las esquinas del jardín, en orden, como `[x, y]`, con la `y` hacia abajo. Puedes usar metros.
- `plano.zonas`: textos sobre el plano, como «Fondo».
- `plantas`: cada planta con `id`, `etiqueta`, `ficha`, `x`, `y` y `notas`.

## Detalles técnicos

- `servidor/`: Node sin dependencias (`node:http`, `node:sqlite`, `node:crypto`).
  - Contraseñas con scrypt; sesiones con cookie `HttpOnly` y `SameSite=Lax` de 60 días, guardadas como hash.
  - Límite de intentos de entrada (10 fallos en 15 minutos por IP o usuario) y de altas nuevas por IP.
  - Pagos con Stripe Checkout y el portal de clientes de Stripe, llamando a su API con `fetch`. Los avisos del webhook se comprueban con su firma HMAC y no se aplican dos veces.
  - Las peticiones que cambian datos tienen que ser JSON y venir del mismo origen.
  - Control de versiones en fichas, notas y jardín: si algo cambió desde otro sitio mientras editabas, la web pregunta antes de sobrescribir.
  - Cabeceras de seguridad (CSP sin scripts en línea, `nosniff`, sin iframes).
- `publico/`: la web, HTML, CSS y módulos ES sin paso de compilación. `sw.js` es el service worker (sin conexión e instalación).
- `semillas/`: datos iniciales.
- `pruebas/`: pruebas de la API y de la suscripción (con un Stripe simulado), con `npm test`.
- Las fuentes (Literata y Atkinson Hyperlegible Next, licencia OFL) van incluidas en `publico/assets/fuentes/`.
