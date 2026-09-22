/**
 * MI CASA SOLUCIONES — Agente de atención al cliente "Sol"
 * Implementación de costo cero: Cloudflare Workers (plan gratuito) + Google Gemini (plan gratuito).
 *
 * NO EDITAR ESTE ARCHIVO A MANO.
 * Se genera con:  python3 construir_worker.py
 * El prompt y la base de conocimiento se toman de los documentos Markdown de la carpeta
 * agente_atencion/, para que exista una sola fuente de verdad.
 */

/* Contenido inyectado por construir_worker.py — no tocar a mano. */
const PROMPT = __PROMPT__;
const KB = __KB__;
const DISPARADORES = __DISPARADORES__;

/* Nombre del modelo de IA. SIEMPRE se puede cambiar con la variable de entorno MODELO,
   sin tocar el código. Verifique el nombre vigente en aistudio.google.com antes de usarlo:
   los nombres de los modelos cambian con el tiempo. */
const MODELO_POR_DEFECTO = "gemini-2.5-flash";

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

function cors(env) {
  return {
    "Access-Control-Allow-Origin": env.SITIO_PERMITIDO || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function json(datos, env, estado = 200) {
  return new Response(JSON.stringify(datos), {
    status: estado,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors(env) },
  });
}

/** Quita acentos y pasa a minúsculas, para comparar palabras clave. */
function normalizar(t) {
  return (t || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Detecta si el mensaje del prospecto debe escalarse a Nelson. */
export function detectarEscalamiento(texto) {
  const t = " " + normalizar(texto) + " ";
  const encontradas = DISPARADORES.filter((p) => t.includes(" " + normalizar(p)));
  return { escala: encontradas.length > 0, palabras: encontradas };
}

/** Traduce el texto del aviso al enlace de WhatsApp de Nelson (para uso interno). */
function enlaceWhatsApp(aviso, telefono) {
  const num = (telefono || "").replace(/[^0-9]/g, "");
  return "https://wa.me/" + num + "?text=" + encodeURIComponent(aviso);
}

function escaparHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

/* ------------------------------------------------------------------ */
/* Límite de uso simple (por IP, en memoria del Worker)                */
/* ------------------------------------------------------------------ */

const uso = new Map();
function permitir(ip, maxPorHora = 30) {
  const ahora = Date.now();
  const registro = uso.get(ip) || { inicio: ahora, cuenta: 0 };
  if (ahora - registro.inicio > 3600000) {
    registro.inicio = ahora;
    registro.cuenta = 0;
  }
  registro.cuenta++;
  uso.set(ip, registro);
  if (uso.size > 5000) uso.clear();
  return registro.cuenta <= maxPorHora;
}

/* ------------------------------------------------------------------ */
/* Llamada al modelo                                                   */
/* ------------------------------------------------------------------ */

async function llamarModelo(env, historial, sistema) {
  const modelo = env.MODELO || MODELO_POR_DEFECTO;
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    modelo +
    ":generateContent?key=" +
    env.GEMINI_API_KEY;

  const contents = historial
    .filter((m) => m && m.content)
    .slice(-12)
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content).slice(0, 4000) }],
    }));

  const cuerpo = {
    systemInstruction: { parts: [{ text: sistema }] },
    contents,
    generationConfig: {
      temperature: 0.2,
      topP: 0.8,
      maxOutputTokens: 700,
    },
    safetySettings: [],
  };

  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });

  const datos = await r.json();

  if (!r.ok) {
    const detalle =
      (datos && datos.error && datos.error.message) || "Error del proveedor de IA";
    throw new Error(detalle);
  }

  const candidato = datos.candidates && datos.candidates[0];
  const partes = candidato && candidato.content && candidato.content.parts;
  const texto = (partes || []).map((p) => p.text || "").join("").trim();

  if (!texto) throw new Error("El modelo no devolvió respuesta");
  return texto;
}

/* ------------------------------------------------------------------ */
/* Aviso a Nelson                                                      */
/* ------------------------------------------------------------------ */

async function enviarAviso(env, textoAviso, meta) {
  const resultados = [];

  // Opción 1: ntfy.sh — notificación push al celular. Lo más simple y gratis.
  if (env.NTFY_TOPIC) {
    try {
      const r = await fetch("https://ntfy.sh/" + env.NTFY_TOPIC, {
        method: "POST",
        headers: {
          Title: "Mi Casa Soluciones - Aviso del agente",
          Priority: meta.prioridad === "ALTA" ? "urgent" : "default",
          Tags: "bell",
        },
        body: textoAviso,
      });
      resultados.push({ canal: "ntfy", ok: r.ok });
    } catch (e) {
      resultados.push({ canal: "ntfy", ok: false, error: String(e) });
    }
  }

  // Opción 2: Resend — correo electrónico (plan gratuito).
  if (env.RESEND_API_KEY && env.CORREO_DESTINO) {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + env.RESEND_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: env.CORREO_REMITENTE || "agente@resend.dev",
          to: [env.CORREO_DESTINO],
          subject:
            "[MCS] " + meta.tipo + " - " + meta.prioridad + " - aviso del agente",
          text: textoAviso,
        }),
      });
      resultados.push({ canal: "correo", ok: r.ok });
    } catch (e) {
      resultados.push({ canal: "correo", ok: false, error: String(e) });
    }
  }

  // Opción 3: cualquier webhook (Zapier, Make, n8n, Google Apps Script...).
  if (env.WEBHOOK_AVISOS) {
    try {
      const r = await fetch(env.WEBHOOK_AVISOS, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: textoAviso, ...meta }),
      });
      resultados.push({ canal: "webhook", ok: r.ok });
    } catch (e) {
      resultados.push({ canal: "webhook", ok: false, error: String(e) });
    }
  }

  return resultados;
}

/* ------------------------------------------------------------------ */
/* Worker                                                              */
/* ------------------------------------------------------------------ */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(env) });
    }

    // Página de prueba mínima en la raíz.
    if (request.method === "GET" && url.pathname === "/") {
      return new Response(
        "<!doctype html><meta charset='utf-8'><title>Agente Mi Casa Soluciones</title>" +
          "<body style='font-family:system-ui;background:#F4F1EC;color:#393536;padding:40px'>" +
          "<h1 style='color:#393536'>Agente Mi Casa Soluciones</h1>" +
          "<p style='color:#1E7B4F'><b>El servicio está funcionando.</b></p>" +
          "<p>Este es el servidor del agente <b>Sol</b>. El chat se instala en la página web con el archivo <code>widget.html</code>.</p>" +
          "<p>Estado: <code>activo</code></p></body>",
        { headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    if (request.method !== "POST" || url.pathname !== "/chat") {
      return json({ error: "No encontrado" }, env, 404);
    }

    const ip =
      request.headers.get("CF-Connecting-IP") ||
      request.headers.get("x-forwarded-for") ||
      "desconocida";
    if (!permitir(ip, Number(env.MAX_POR_HORA || 30))) {
      return json(
        {
          reply:
            "Ha hecho muchas consultas seguidas. Por favor escríbanos por WhatsApp al +593 96 330 3081 y con gusto le atendemos.",
          escalar: true,
        },
        env,
        200
      );
    }

    let cuerpo;
    try {
      cuerpo = await request.json();
    } catch (e) {
      return json({ error: "Cuerpo inválido" }, env, 400);
    }

    const historial = Array.isArray(cuerpo.messages) ? cuerpo.messages : [];
    const ultimo = historial.filter((m) => m.role !== "assistant").pop();
    const textoUsuario = ultimo ? String(ultimo.content || "") : "";

    if (!textoUsuario.trim()) {
      return json({ error: "Mensaje vacío" }, env, 400);
    }

    const sistema = PROMPT + "\n\n" + KB;
    const deteccion = detectarEscalamiento(textoUsuario);

    let respuesta;
    try {
      respuesta = await llamarModelo(env, historial, sistema);
    } catch (e) {
      return json(
        {
          reply:
            "Disculpe, en este momento no puedo responder. Por favor escríbanos por WhatsApp al +593 96 330 3081 y con gusto le atendemos.",
          escalar: true,
          tipo: "OTRO",
          prioridad: "ALTA",
          error: String(e),
        },
        env,
        200
      );
    }

    // El modelo avisa a Nelson cuando corresponde (según el prompt).
    const traeAviso = respuesta.indexOf("AVISO PARA NELSON") !== -1;

    // `escalar` = el agente decidió pasar el caso a Nelson (se le dice al prospecto).
    // `revisar` = además, una palabra clave sugiere que conviene que Nelson lo mire.
    const escalar = traeAviso;
    const revisar = escalar || deteccion.escala;

    let tipo = "OTRO";
    const mTipo = respuesta.match(/TIPO:\s*([A-ZÁÉÍÓÚÑ /]+)/);
    if (mTipo) tipo = mTipo[1].trim();

    let prioridad = deteccion.escala ? "MEDIA" : "BAJA";
    const mPri = respuesta.match(/PRIORIDAD:\s*(ALTA|MEDIA|BAJA)/);
    if (mPri) prioridad = mPri[1];
    if (/urgente|emergencia|humo|gas|chispa|quemado|911/i.test(textoUsuario)) {
      prioridad = "ALTA";
      tipo = "URGENTE";
    }

    // Al prospecto se le muestra la respuesta SIN el bloque interno de aviso.
    const paraCliente = respuesta
      .replace(/🔔?\s*AVISO PARA NELSON[\s\S]*$/i, "")
      .trim();

    // Aviso que se envía a Nelson: el del modelo, o uno de respaldo si se pidió
    // revisión obligatoria (env AVISO_SIEMPRE = "si").
    let avisoParaEnviar = traeAviso ? respuesta : null;
    if (!avisoParaEnviar && env.AVISO_SIEMPRE === "si" && revisar) {
      avisoParaEnviar =
        "🔔 AVISO PARA NELSON — revisar conversación\n" +
        "TIPO: " + tipo + "\n" +
        "PRIORIDAD: " + prioridad + "\n" +
        'LO QUE PIDIÓ (textual): "' + textoUsuario.slice(0, 300) + '"\n' +
        'LO QUE YA RESPONDÍ: "' + (paraCliente || respuesta).slice(0, 300) + '"\n' +
        "FALTA CONFIRMAR: si la respuesta fue correcta\n" +
        "ACCIÓN SUGERIDA: revisar la conversación";
    }

    let avisos = [];
    if (avisoParaEnviar) {
      avisos = await enviarAviso(env, avisoParaEnviar, { tipo, prioridad });
    }

    return json(
      {
        reply: paraCliente || respuesta,
        escalar,
        revisar,
        palabrasClave: deteccion.palabras,
        tipo,
        prioridad,
        avisoInterno: traeAviso ? respuesta : null,
        avisosEnviados: avisos,
        whatsappNelson: avisoParaEnviar
          ? enlaceWhatsApp(avisoParaEnviar, env.WHATSAPP_NELSON || "+593963303081")
          : null,
      },
      env,
      200
    );
  },
};
