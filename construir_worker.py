#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Genera el archivo `worker.js` (listo para pegar en Cloudflare Workers) a partir de:

  - agente_atencion/01_Prompt_del_Agente.md      -> el prompt (bloque de la sección 2)
  - agente_atencion/02_Base_de_Conocimiento.md   -> la base de conocimiento
  - agente_atencion/03_Preguntas_Frecuentes.md   -> las preguntas frecuentes
  - agente_atencion/agente_config.json           -> palabras clave y plantilla de aviso
  - implementacion/plantilla_worker.js           -> el código del servidor

NOTA IMPORTANTE SOBRE EL TAMAÑO
El documento 04 (protocolo de avisos) NO se inyecta: está dirigido a Nelson, no al agente, y sus
reglas ya están dentro del prompt. Incluirlo solo gastaría cuota y podría confundir al modelo.
El agente nunca debe recibir documentación interna que no necesite.

Uso:
    cd Plan_Mi_Casa_Soluciones/agente_atencion/implementacion
    python3 construir_worker.py

Salida:
    worker.js   (un solo archivo, autocontenido, listo para Cloudflare)
"""
import io
import json
import os
import re
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.dirname(AQUI)


def leer(nombre):
    ruta = os.path.join(BASE, nombre)
    if not os.path.exists(ruta):
        sys.exit("ERROR: no encuentro el archivo " + ruta)
    return io.open(ruta, encoding="utf-8").read()


def extraer_prompt(md):
    """Toma el primer bloque ``` que aparece después del título de la sección 2."""
    corte = md.find("## 2. Prompt completo")
    if corte == -1:
        sys.exit("ERROR: no encuentro la sección '## 2. Prompt completo' en el documento 01.")
    inicio = md.find("```", corte)
    if inicio == -1:
        sys.exit("ERROR: no encuentro el bloque de código del prompt.")
    inicio = md.find("\n", inicio) + 1
    fin = md.find("```", inicio)
    if fin == -1:
        sys.exit("ERROR: el bloque de código del prompt no está cerrado.")
    return md[inicio:fin].rstrip() + "\n"


def main():
    prompt = extraer_prompt(leer("01_Prompt_del_Agente.md"))
    kb = leer("02_Base_de_Conocimiento.md").rstrip() + "\n"
    faq = leer("03_Preguntas_Frecuentes.md").rstrip() + "\n"

    with io.open(os.path.join(BASE, "agente_config.json"), encoding="utf-8") as f:
        cfg = json.load(f)

    disparadores = cfg["escalamiento"]["palabras_clave_disparadoras"]

    plantilla = io.open(os.path.join(AQUI, "plantilla_worker.js"), encoding="utf-8").read()

    contenido = (
        "PROMPT Y REGLAS DEL AGENTE\n"
        "==========================\n\n"
        + prompt
        + "\n\nBASE DE CONOCIMIENTO\n"
        "====================\n\n"
        + kb
        + "\n\nPREGUNTAS FRECUENTES Y CONVERSACIONES MODELO\n"
        "============================================\n\n"
        + faq
    )

    salida = plantilla
    salida = salida.replace("__PROMPT__", json.dumps(prompt, ensure_ascii=False))
    salida = salida.replace("__KB__", json.dumps(contenido, ensure_ascii=False))
    salida = salida.replace("__DISPARADORES__", json.dumps(disparadores, ensure_ascii=False))

    # Comprobación: no deben quedar marcadores sin reemplazar.
    sobrantes = re.findall(r"__[A-Z_]+__", salida)
    if sobrantes:
        sys.exit("ERROR: quedaron marcadores sin reemplazar: " + ", ".join(sorted(set(sobrantes))))

    destino = os.path.join(AQUI, "worker.js")
    with io.open(destino, "w", encoding="utf-8") as f:
        f.write(salida)

    # Estimación de consumo: se envía el prompt + el conocimiento en CADA mensaje.
    caracteres = len(prompt) + len(contenido)
    tokens_aprox = int(caracteres / 4)

    print("Listo: " + destino)
    print("  prompt:        %d caracteres" % len(prompt))
    print("  conocimiento:  %d caracteres" % len(contenido))
    print("  disparadores:  %d palabras clave" % len(disparadores))
    print("  archivo final: %d caracteres" % len(salida))
    print("  CONSUMO POR MENSAJE: ~%d caracteres = ~%d tokens de entrada" % (caracteres, tokens_aprox))
    print("  (referencia: 300 conversaciones x 8 mensajes = 2400 mensajes/mes"
          "  =>  ~%.1f millones de tokens de entrada al mes)" % (tokens_aprox * 2400 / 1000000.0))


if __name__ == "__main__":
    main()
