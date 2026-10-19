# Jardín de Colmenar

Web para llevar el jardín: un plano con cada planta, una ficha por tipo de planta con su ciclo anual y una vista por meses de todo el jardín. Funciona en GitHub Pages tal cual, sin servidor y sin compilar nada, y se usa bien desde el móvil.

- **Temporada**: el mes de hoy (o el que elijas) con lo que pasa y lo que toca hacer en cada planta, y una línea del año con las épocas de todas.
- **Plano**: el contorno del jardín con las plantas marcadas. Se pueden mover, añadir y quitar.
- **Fichas**: el documento de cada tipo de planta, con su calendario de tareas dibujado sobre los doce meses.

## Publicarla en GitHub Pages

1. Crea un repositorio en GitHub, por ejemplo `jardin`. Con la cuenta gratuita tiene que ser público para usar Pages.
2. Sube todo el contenido de esta carpeta a la raíz del repositorio, **incluido el archivo oculto `.nojekyll`**.
3. En el repositorio, ve a *Settings → Pages*, elige *Deploy from a branch*, rama `main` y carpeta `/ (root)`, y guarda.
4. En uno o dos minutos la web estará en `https://TU-USUARIO.github.io/jardin/`.

Con la línea de comandos:

```sh
cd jardin
git init -b main
git add .
git commit -m "Web del jardín"
git remote add origin https://github.com/TU-USUARIO/jardin.git
git push -u origin main
```

## Editar

Hay dos maneras, y se pueden mezclar:

- **Desde la propia web**, también en el móvil. Pega un token de GitHub en *Ajustes* (el icono de arriba a la derecha). A partir de ahí, «Editar ficha», «Nueva ficha» y «Editar plano» guardan directamente en el repositorio; cada guardado es un commit.
- **Desde GitHub**, editando los archivos de `fichas/` y `datos/jardin.json` con su editor. La web publicada se actualiza en un minuto.

Si guardas desde la web sin token, te ofrece copiar el texto o descargar el archivo para subirlo a mano.

### Crear el token

1. Entra en <https://github.com/settings/personal-access-tokens/new>.
2. Ponle un nombre, como «Web del jardín», y una fecha de caducidad.
3. En *Repository access* elige *Only select repositories* y marca el repositorio del jardín.
4. En *Permissions*, busca *Contents* y cámbialo a *Read and write*.
5. Pulsa *Generate token*, cópialo y pégalo en *Ajustes* de la web.

El token se guarda solo en el navegador donde lo pegas. Todas las webs de `TU-USUARIO.github.io` comparten ese almacenamiento, así que dale acceso solo a este repositorio.

## Cómo se escribe una ficha

Cada tipo de planta es un archivo `fichas/<nombre>.md`:

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

## Invierno (dic–feb)

…
```

- **Los meses entre paréntesis** de cada título deciden en qué meses aparece ese texto en *Temporada*. Cada planta tiene sus fechas: el otoño del granado va de septiembre a noviembre y el de la higuera, de octubre a noviembre.
- **`## Calendario`** es una lista de tareas, una por línea: `- meses: texto`. Valen los meses abreviados (`ene feb mar abr may jun jul ago sep oct nov dic`) o enteros, un solo mes o un rango, y rangos que cruzan el año (`nov–feb`). Cada tarea es una barra del ciclo anual.
- **El color de cada tarea** sale de su primera palabra: Cosecha, Poda, Riego, Abonado, Heladas, Pulgón, Floración, Brotación, Plantar… Para elegirlo tú, termina la línea con `#cosecha`, `#poda`, `#riego`, `#abono`, `#proteccion`, `#plagas`, `#flor`, `#hoja`, `#plantar` u `#otro`.
- **Los títulos sin meses**, como `## Problemas típicos`, salen solo en la ficha.
- Para añadir un tipo de planta: «Nueva ficha» en la web, o crea el `.md` y añade su nombre (sin `.md`) a la lista `fichas` de `datos/jardin.json`.

## El plano: `datos/jardin.json`

- `nombre`: el nombre que sale arriba.
- `fichas`: las fichas que se cargan, en orden.
- `plano.contorno`: las esquinas del jardín, en orden, como `[x, y]`, con la `y` hacia abajo. Las medidas de ahora salen de tu dibujo (un carácter = 0,1). Si mides el jardín, puedes poner metros reales y luego recolocar las plantas.
- `plano.zonas`: textos sobre el plano, como «Fondo».
- `plantas`: cada planta con `id`, `etiqueta` (lo que se ve en el plano), `ficha` (el nombre del archivo de su ficha), `x`, `y` y `notas`.

Las higueras se llaman `Hi1` y `Hi2` para no confundirlas con las hortensias `H1` y `H2` del fondo.

## Probarla en el ordenador

Dentro de la carpeta, ejecuta `python3 -m http.server` y abre <http://localhost:8000>. Abriendo `index.html` directamente no funciona, porque el navegador no deja leer las fichas desde el disco.

## Detalles técnicos

- HTML, CSS y JavaScript sin dependencias ni paso de compilación; módulos ES en `assets/js/`.
- Lee los archivos con `fetch` y un parámetro que evita la caché de GitHub Pages. Con token, los lee con la API de GitHub, así que ve los cambios al instante.
- Guarda con la API de contenidos de GitHub (`PUT /repos/{usuario}/{repo}/contents/{ruta}`). Si el archivo cambió en GitHub mientras editabas, pregunta antes de sobrescribirlo.
- Las fuentes (Literata y Atkinson Hyperlegible Next, licencia OFL) van incluidas en `assets/fuentes/`; no hay llamadas a Google Fonts.
- `.nojekyll` impide que GitHub Pages procese los `.md` con Jekyll. Sin él, las fichas no se cargarían.
