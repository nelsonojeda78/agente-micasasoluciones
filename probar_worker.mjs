/**
 * Pruebas del Worker del agente (sin internet y sin claves).
 * Uso:  node probar_worker.mjs
 */

import worker, { detectarEscalamiento } from "./worker.js";

let pasadas = 0;
let fallidas = 0;

function comprobar(nombre, condicion, detalle) {
  if (condicion) {
    pasadas++;
    console.log("  ✅ " + nombre);
  } else {
    fallidas++;
    console.log("  ❌ " + nombre + (detalle ? "  → " + detalle : ""));
  }
}

/* ---------- 1. Detección de escalamiento ---------- */

console.log("\n1) Detección de escalamiento por palabras clave");
comprobar("'¿cuánto cuesta?' escala", detectarEscalamiento("¿cuánto cuesta pintar?").escala);
comprobar("'cuanto me sale' escala", detectarEscalamiento("cuanto me sale el punto").escala);
comprobar("'quiero hablar con una persona' escala", detectarEscalamiento("quiero hablar con una persona").escala);
comprobar("'huele a gas' escala", detectarEscalamiento("huele a gas en la cocina").escala);
comprobar("'soy administrador de un condominio' escala", detectarEscalamiento("soy administrador de un condominio").escala);
comprobar("'me hacen descuento' escala", detectarEscalamiento("me hacen un descuento").escala);
comprobar("acentos: 'garantia' y 'garantía' escalan igual",
  detectarEscalamiento("que garantia dan").escala && detectarEscalamiento("que garantía dan").escala);
comprobar("saludo normal NO escala", !detectarEscalamiento("hola buenos días").escala);
comprobar("consulta de servicio NO escala", !detectarEscalamiento("tengo una fuga en el baño").escala);
comprobar("consulta de servicio NO escala (2)", !detectarEscalamiento("necesito pintar mi casa").escala);

/* ---------- 2. Worker con modelo simulado ---------- */

const AVISO_SIMULADO =
  "🔔 AVISO PARA NELSON — 21/09 15:42\n" +
  "TIPO: COTIZACIÓN\n" +
  "PRIORIDAD: MEDIA\n" +
  "CLIENTE: Pedro · 0999999999\n" +
  "ZONA: La Libertad\n" +
  "SERVICIO: Pintura interior\n" +
  'LO QUE PIDIÓ (textual): "cuanto me cobra por pintar"\n' +
  'LO QUE YA RESPONDÍ: "Pintura desde USD 4,50/m2"\n' +
  "FALTA CONFIRMAR: Precio exacto\n" +
  "ACCIÓN SUGERIDA: Llamar y cotizar";

let avisosNtfy = [];
let ultimoCuerpoModelo = null;
let respuestaModelo = "Claro, con gusto.\n\n" + AVISO_SIMULADO;

globalThis.fetch = async (url, opciones) => {
  const u = String(url);
  if (u.indexOf("generativelanguage.googleapis.com") !== -1) {
    ultimoCuerpoModelo = JSON.parse(opciones.body);
    return new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: respuestaModelo }] } }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
  if (u.indexOf("ntfy.sh") !== -1) {
    avisosNtfy.push(opciones.body);
    return new Response("ok", { status: 200 });
  }
  throw new Error("URL no simulada: " + u);
};

const env = {
  GEMINI_API_KEY: "clave-de-prueba",
  NTFY_TOPIC: "tema-de-prueba",
  WHATSAPP_NELSON: "+593963303081",
};

async function preguntar(texto) {
  const r = await worker.fetch(
    new Request("https://agente.test/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: texto }] }),
    }),
    env
  );
  return { estado: r.status, datos: await r.json() };
}

console.log("\n2) El aviso interno NO se le muestra al prospecto");
const r1 = await preguntar("cuanto me cobra por pintar");
comprobar("responde 200", r1.estado === 200);
comprobar("marca escalar = true", r1.datos.escalar === true);
comprobar("la respuesta al cliente NO contiene el aviso",
  r1.datos.reply.indexOf("AVISO PARA NELSON") === -1);
comprobar("la respuesta al cliente conserva el texto útil",
  r1.datos.reply.indexOf("Claro, con gusto") !== -1);
comprobar("el aviso interno sí se devuelve aparte",
  typeof r1.datos.avisoInterno === "string" && r1.datos.avisoInterno.indexOf("AVISO PARA NELSON") !== -1);
comprobar("tipo detectado = COTIZACIÓN", r1.datos.tipo === "COTIZACIÓN", r1.datos.tipo);
comprobar("prioridad detectada = MEDIA", r1.datos.prioridad === "MEDIA", r1.datos.prioridad);
comprobar("se envió 1 aviso por ntfy", avisosNtfy.length === 1);
comprobar("el enlace de WhatsApp apunta al número de Nelson",
  String(r1.datos.whatsappNelson).indexOf("593963303081") !== -1);

console.log("\n3) Prioridad ALTA en emergencias y red de seguridad");
avisosNtfy = [];
respuestaModelo = "Primero la seguridad: cierre la llave de paso y salga del área.";
const r2 = await preguntar("urgente, huele a gas en la cocina");
comprobar("marca revisar = true por palabra clave", r2.datos.revisar === true);
comprobar("prioridad = ALTA", r2.datos.prioridad === "ALTA", r2.datos.prioridad);
comprobar("tipo = URGENTE", r2.datos.tipo === "URGENTE", r2.datos.tipo);
comprobar("NO se le dice al prospecto 'le pasé su caso' si el agente no escaló",
  r2.datos.escalar === false);
comprobar("las palabras clave detectadas se informan al panel interno",
  Array.isArray(r2.datos.palabrasClave) && r2.datos.palabrasClave.length > 0);
comprobar("sin aviso del modelo y sin AVISO_SIEMPRE, no se notifica (evita ruido)",
  avisosNtfy.length === 0);

const envEstricto = Object.assign({}, env, { AVISO_SIEMPRE: "si" });
const r2b = await worker.fetch(
  new Request("https://agente.test/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "urgente, huele a gas" }] }),
  }),
  envEstricto
);
await r2b.json();
comprobar("con AVISO_SIEMPRE=si, sí se envía un aviso de respaldo", avisosNtfy.length === 1);
comprobar("el aviso de respaldo está bien formado",
  avisosNtfy[0].indexOf("AVISO PARA NELSON") !== -1 && avisosNtfy[0].indexOf("URGENTE") !== -1);

console.log("\n4) El sistema enviado al modelo contiene las reglas y el catálogo");
const sistema = ultimoCuerpoModelo.systemInstruction.parts[0].text;
comprobar("incluye la regla R2 (no dar precios fuera de los 8)", sistema.indexOf("R2.") !== -1);
comprobar("incluye la regla R3 (no prometer fechas)", sistema.indexOf("R3.") !== -1);
comprobar("incluye el formato de aviso", sistema.indexOf("AVISO PARA NELSON") !== -1);
comprobar("incluye los precios públicos", sistema.indexOf("desde USD 65") !== -1);
comprobar("incluye la garantía", sistema.indexOf("12 meses") !== -1);
comprobar("temperatura baja (0.2) para no inventar", ultimoCuerpoModelo.generationConfig.temperature === 0.2);
comprobar("no incluye la tabla interna de salarios",
  sistema.indexOf("Salario Básico Unificado") === -1);
comprobar("no incluye la cédula del titular", sistema.indexOf("1002170775") === -1);
comprobar("no incluye el factor de mano de obra interno",
  sistema.indexOf("factor 1,8") === -1 && sistema.indexOf("1,8 — uso interno") === -1);

console.log("\n5) Casos límite");
const rVacio = await worker.fetch(
  new Request("https://agente.test/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "   " }] }),
  }),
  env
);
comprobar("mensaje vacío → 400", rVacio.status === 400);

const rRaiz = await worker.fetch(new Request("https://agente.test/"), env);
comprobar("GET / responde 200 y dice que está activo", rRaiz.status === 200);
const html = await rRaiz.text();
comprobar("GET / confirma funcionamiento", html.indexOf("funcionando") !== -1);

const rOtra = await worker.fetch(new Request("https://agente.test/otra"), env);
comprobar("ruta desconocida → 404", rOtra.status === 404);

/* ---------- Resumen ---------- */

console.log("\n" + "=".repeat(52));
console.log("  PRUEBAS PASADAS: " + pasadas);
console.log("  PRUEBAS FALLIDAS: " + fallidas);
console.log("=".repeat(52) + "\n");

process.exit(fallidas === 0 ? 0 : 1);
