# miJardin

Web multiusuario del jardín (plano, fichas y calendario), instalable como app. Servidor Node sin dependencias con SQLite (`servidor/`), web sin compilar (`publico/`). Se despliega en la devbox (ver `despliegue/GUIA-DEVBOX.md`).

## Reglas de trabajo

- **Todos los cambios van a `main`**: commit y push directamente a `main`, sin ramas ni pull requests, salvo que se pida otra cosa. Lo que llega a `main` se publica solo en la devbox (cron cada 10 min con `despliegue/actualizar.sh`).
- **Versiones**: empiezan en 0.0.1 y cada commit sube el tercer dígito automáticamente (`despliegue/version.sh` cuenta los commits desde el último cambio del archivo `VERSION`). **El primer y el segundo dígito solo se cambian cuando el usuario lo pide**, editando `VERSION` (p. ej. a `0.1.0`). No toques `VERSION` por tu cuenta, ni pongas `version` en `package.json`.
- Evita los commits de fusión en `main` (cada commit cuenta como versión): integra con fast-forward o rebase.

## Convenciones

- Todo en español: interfaz, textos, nombres de variables y funciones, comentarios y mensajes de commit.
- Sin dependencias de npm ni paso de compilación. Solo módulos de Node 22.13+ (`node:http`, `node:sqlite`, `node:crypto`) y módulos ES en el navegador.
- Cambios en la base de datos: añade una entrada nueva al final de `ESQUEMA` en `servidor/db.js`; no modifiques las existentes (las bases ya creadas se migran solas al arrancar).
- Si añades un archivo JS a `publico/assets/js/`, añádelo a la lista de `publico/sw.js` y cambia allí la constante `VERSION` (no es la del archivo `VERSION`) para que la app sin conexión lo incluya.

## Comprobar

- `npm test` (API, suscripciones con Stripe simulado, versión).
- `npm start` y abrir http://localhost:8080 (con `ADMIN_USUARIO`/`ADMIN_CLAVE` en `.env` la primera vez).
