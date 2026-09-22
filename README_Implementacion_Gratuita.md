# IMPLEMENTACIÓN GRATUITA — PASO A PASO
## Cómo publicar el agente en internet sin pagar alojamiento

> **Qué se consigue con esta guía.** El agente "Sol" funcionando de verdad: una ventana de chat en
> la página web de Mi Casa Soluciones, que responde a los prospectos y que le manda a Nelson un
> aviso al celular cuando hay dinero, una fecha o un reclamo de por medio.
>
> **Cuánto cuesta:** **USD 0 al mes** dentro de los límites de los planes gratuitos.
>
> **Cuánto se tarda:** entre 40 y 60 minutos la primera vez.
>
> **Qué nivel técnico hace falta:** ninguno especial, pero hay que seguir los pasos **en orden** y
> copiar y pegar con cuidado. Si algo no sale, al final hay una tabla de problemas y soluciones.

---

## 1. Qué se va a usar (y por qué es lo más barato)

| Pieza | Servicio | Plan | Costo |
|---|---|---|---|
| El "cerebro" (la IA que escribe) | **Google Gemini API** | Nivel gratuito | USD 0 |
| El servidor (guarda el prompt y las reglas) | **Cloudflare Workers** | Plan gratuito | USD 0 |
| La ventana de chat | **GitHub Pages** (la web que ya existe) | Gratuito | USD 0 |
| Los avisos al celular de Nelson | **ntfy.sh** | Gratuito | USD 0 |

> **Por qué esta combinación y no una plataforma "todo en uno":** porque el trabajo pesado (el
> prompt, las reglas y la base de conocimiento) queda **en un archivo propio**, que se puede llevar
> a cualquier otro proveedor el día de mañana. No queda encerrado en una plataforma.
>
> Si prefiere no hacer nada de esto, en `../06_Alojamiento_y_Costos.md` está la comparación con las
> plataformas que lo hacen todo por usted, con sus precios.

---

## 2. Lo que hay que tener a mano

- [ ] Una cuenta de **Google** (la que ya usa, sirve).
- [ ] Una cuenta de **Cloudflare** (se crea gratis en `dash.cloudflare.com`, pide correo y
      contraseña).
- [ ] El **celular de Nelson** con la aplicación **ntfy** instalada (se busca "ntfy" en Play Store
      o App Store; es gratis y no pide cuenta).
- [ ] Los archivos de esta carpeta.
- [ ] Si va a publicar el chat en la web: la cuenta de **GitHub** que ya usa para
      `nelsonojeda78/micasasoluciones`.

---

## 3. Paso 1 — Conseguir la clave de Google Gemini (5 minutos)

1. Entre a **`aistudio.google.com/apikey`**.
2. Inicie sesión con la cuenta de Google.
3. Pulse **"Create API key"** / **"Crear clave de API"**.
4. Copie la clave (empieza parecido a `AIza...`) y **guárdela en un lugar seguro**. Es como una
   contraseña: no se comparte ni se publica.
5. **Importante:** en `aistudio.google.com` verifique el **nombre exacto del modelo** que va a usar
   (por ejemplo, un modelo de la familia *Flash*, que es la más económica y la que tiene nivel
   gratuito). El nombre cambia con el tiempo: **se copia el que aparezca vigente**, no se inventa.

> El nivel gratuito tiene **límites de uso por minuto y por día** que Google puede cambiar. Están
> publicados en `ai.google.dev/gemini-api/docs/rate-limits` y se ven en tiempo real en
> `aistudio.google.com/rate-limit`. Para el volumen de Mi Casa Soluciones (unas 300 conversaciones
> al mes) alcanza de sobra.

---

## 4. Paso 2 — Crear el servidor en Cloudflare (15 minutos)

1. Entre a **`dash.cloudflare.com`** y cree la cuenta (o inicie sesión).
2. En el menú de la izquierda, busque **"Workers & Pages"** (o "Compute (Workers)").
3. Pulse **"Create"** → **"Create Worker"** (o "Start with Hello World!").
4. Póngale un nombre: **`agente-micasasoluciones`**. Pulse **"Deploy"**.
5. Pulse **"Edit code"** (Editar código).
6. **Borre todo** lo que aparece en el editor.
7. Abra el archivo **`worker.js`** de esta carpeta con un editor de texto (Bloc de notas, o el
   editor del repositorio), **seleccione todo** y **cópielo**.
8. **Péguelo** en el editor de Cloudflare.
9. Pulse **"Deploy"** / **"Save and Deploy"**.
10. Cloudflare le da una dirección parecida a:
    **`https://agente-micasasoluciones.SU-USUARIO.workers.dev`**
    **Cópiela**: es la dirección del agente.

> **El archivo `worker.js` no se edita a mano.** Si cambia algo de la base de conocimiento, se
> regenera (ver el punto 9) y se vuelve a pegar.

---

## 5. Paso 3 — Configurar las variables (10 minutos)

En la pantalla del Worker: **Settings** → **Variables and Secrets** (Variables y secretos) →
**Add**. Se agregan una por una:

| Nombre | Valor | ¿Secreto? | Para qué |
|---|---|---|---|
| `GEMINI_API_KEY` | la clave del Paso 1 | **Sí (Secret)** | Es la clave de la IA. **Debe ir como secreto**, nunca como texto normal. |
| `MODELO` | el nombre del modelo vigente (por ejemplo `gemini-2.5-flash`, o el que haya copiado de AI Studio) | No | Cuál modelo usar |
| `NTFY_TOPIC` | un nombre largo e inventado, por ejemplo `mcs-avisos-7f3k9x2p` | No | El "canal" por donde llegan los avisos al celular |
| `WHATSAPP_NELSON` | `+593963303081` | No | Para el enlace de reenvío del aviso |
| `SITIO_PERMITIDO` | la dirección de su web (por ejemplo `https://nelsonojeda78.github.io`) | No | Evita que otra página use su agente |
| `MAX_POR_HORA` | `30` | No | Límite de mensajes por visitante, para proteger la cuota gratuita |
| `CORREO_DESTINO` | `nelsonojedablog@gmail.com` | No | Solo si además quiere los avisos por correo (necesita `RESEND_API_KEY`) |

Después de agregarlas, pulse **"Deploy"** otra vez.

> **Si más adelante quiere avisos por correo** además del celular: cree una cuenta gratuita en
> `resend.com`, genere una clave y agréguela como secreto `RESEND_API_KEY`. El Worker ya está
> preparado para enviarlos.

---

## 6. Paso 4 — Probar que el servidor funciona (2 minutos)

1. Abra en el navegador la dirección del Worker (la del Paso 2, punto 10).
2. Debe aparecer una página que dice **"El servicio está funcionando"** y **"Estado: activo"**.
3. Si aparece un error, revise: que el código se haya pegado completo, que se haya pulsado
   **Deploy** y que `GEMINI_API_KEY` esté configurada como **Secret**.

---

## 7. Paso 5 — Que los avisos lleguen al celular (5 minutos)

1. Instale la aplicación **ntfy** en el celular de Nelson (Play Store o App Store).
2. Ábrala y pulse **"+"** (Subscribe / Suscribirse).
3. Escriba **exactamente** el mismo valor que puso en `NTFY_TOPIC` (por ejemplo
   `mcs-avisos-7f3k9x2p`).
4. Pulse **Subscribe**.

**Prueba:** en el Worker, abra la dirección `https://su-worker.workers.dev/` … todavía no hay botón
de prueba. Para probar el aviso, use la página `widget.html` (Paso 6), escriba algo como
*"cuánto me cuesta pintar mi casa"* y verifique que:
- el chat responde, y
- **llega una notificación al celular** con el bloque "🔔 AVISO PARA NELSON".

> **Importante sobre la privacidad de ntfy:** el canal gratuito de `ntfy.sh` es público si alguien
> adivina el nombre del tema. Por eso el nombre debe ser **largo y difícil de adivinar**
> (como `mcs-avisos-7f3k9x2p`), y el aviso **no debe contener datos sensibles**. Si más adelante
> quiere algo privado, se puede instalar su propio servidor de ntfy o cambiar a correo.

---

## 8. Paso 6 — Poner el chat en la página web (10 minutos)

1. Abra el archivo **`widget.html`** con un editor de texto.
2. Busque la línea:
   `var API_URL = "https://REEMPLAZAR-POR-TU-WORKER.workers.dev/chat";`
3. Reemplace la dirección por la de su Worker, **terminando en `/chat`**. Por ejemplo:
   `var API_URL = "https://agente-micasasoluciones.su-usuario.workers.dev/chat";`
4. Guarde el archivo con el nombre **`index.html`** (o súbalo junto con los demás archivos de la
   web) en el repositorio `nelsonojeda78/micasasoluciones`.
5. Espere 1 o 2 minutos y abra la web.
6. En la esquina inferior derecha debe aparecer el **botón ámbar**. Ábralo y converse con el agente.

**Para probar los avisos internos:** agregue `?interno=1` al final de la dirección (o pulse
`Ctrl + Shift + A`). Aparece un panel negro abajo con el aviso que el agente generó para Nelson y un
enlace para reenviarlo por WhatsApp.

> **Para ponerlo en una web que no es la suya:** se copian las tres partes del archivo (el `<style>`,
> el bloque del botón y la ventana, y el `<script>`) y se pegan antes de `</body>`.

---

## 9. Paso 7 — Correr las 25 pruebas antes de publicar (20 minutos)

Abra el chat y copie, uno por uno, los mensajes de la tabla del documento
**`../05_Pruebas_de_Aceptacion.md`**. Anote cuáles pasan y cuáles no.

**Si alguna prueba falla, corrija la base de conocimiento y vuelva a publicar.** No se conforma con
"casi todas pasan": el agente es la cara de la empresa.

---

## 10. Cómo se actualiza el agente cuando cambia algo

El agente **no se edita en Cloudflare**. Se edita la fuente y se regenera:

```
1. Se cambia el texto en  02_Base_de_Conocimiento.md  o  03_Preguntas_Frecuentes.md
   (o el prompt en 01_Prompt_del_Agente.md)
2. Se abre la carpeta implementacion/ y se ejecuta:   python3 construir_worker.py
3. Se copia el nuevo worker.js y se pega otra vez en Cloudflare
4. Se pulsa Deploy
```

**Antes de subirlo, se puede comprobar sin gastar nada:**

```
node probar_worker.mjs
```

Debe decir **"PRUEBAS FALLIDAS: 0"**. Si alguna falla, no se publica.

---

## 11. Límites y advertencias honestas

| Advertencia | Detalle |
|---|---|
| **El nivel gratuito se puede agotar** | Si un día hay muchísimas consultas, Google puede responder "límite excedido". El Worker ya está preparado: en ese caso el agente responde con el WhatsApp del negocio en lugar de quedarse callado. |
| **Los límites gratuitos cambian** | Google ajusta sus cuotas. Se revisan en `ai.google.dev/gemini-api/docs/rate-limits`. |
| **Privacidad en el nivel gratuito** | En el nivel gratuito, Google puede usar el contenido para mejorar sus productos. **Por eso el agente tiene prohibido pedir cédula, datos bancarios o documentos.** Si más adelante quiere garantía de privacidad, hay que pasar a un plan pagado o a otro proveedor. |
| **El canal de ntfy es público si se adivina** | Use un nombre largo e impredecible y no incluya datos sensibles en el aviso. |
| **La IA puede equivocarse** | Por eso existe el escalamiento: **todo lo que tenga que ver con dinero o decisiones lo confirma una persona**. El agente no cierra tratos. |
| **No es un servicio con garantía de disponibilidad** | Los planes gratuitos no ofrecen acuerdo de nivel de servicio. Si el negocio depende del chat, conviene pasar a un plan pagado (ver `../06_Alojamiento_y_Costos.md`). |
| **No usar en dos lugares a la vez sin revisar** | Si cambia de proveedor, la base de conocimiento es la misma: el agente no queda encerrado. |

---

## 12. Si algo no funciona

| Síntoma | Causa más probable | Solución |
|---|---|---|
| La página del Worker dice "No encontrado" | Se abrió una dirección con `/chat` en el navegador (esa ruta solo acepta el chat) | Abra la dirección sin `/chat` |
| El chat responde "hubo un problema de conexión" | `API_URL` mal escrita en `widget.html`, o falta `/chat` al final | Revise la constante `API_URL` |
| El chat dice "no puedo responder" siempre | La clave `GEMINI_API_KEY` falta, está mal o el nombre del modelo no existe | Revise las variables y verifique el nombre del modelo en AI Studio |
| No llegan las notificaciones al celular | El tema de ntfy no coincide, o la app no está suscrita | Copie el valor exacto de `NTFY_TOPIC` y suscríbase otra vez |
| El agente inventa precios | Se pegó la versión corta del prompt sin las reglas, o la plataforma tiene "conocimiento general" activado | Vuelva a pegar el prompt completo y verifique que solo use sus documentos |
| Quiero cambiar el nombre "Sol" | Está en el prompt (sección IDENTIDAD) y en el mensaje de bienvenida | Cámbielo en `01_Prompt_del_Agente.md`, regenere y publique |
| Quiero borrar el agente | En Cloudflare: Settings → Delete Worker. En la web: quite el `<script>` | — |

---

*Para la comparación de precios con otras opciones, ver `../06_Alojamiento_y_Costos.md`.*
