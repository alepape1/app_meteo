# Handoff: Aquantia – Animaciones "Ahorro este mes" + Botón de apagado

## Overview
Dos animaciones para la app **aquantIAlab**:

1. **Card "Ahorro este mes"** – Una gota de agua se va rellenando a medida que el usuario consume litros este mes. Al acercarse al límite mensual, el agua cambia a ámbar; al superarlo, cambia a rojo y la card vibra ligeramente.
2. **Botón de apagado** – Una gota con un símbolo de power dentro. Al hacer hover, el símbolo y el borde de la gota se iluminan en rojo con un glow pulsante.

## About the Design Files
Los archivos de este bundle son **referencias de diseño construidas en HTML** — prototipos que muestran el aspecto y comportamiento deseados, **no código de producción para copiar literalmente**. La tarea es **recrear estos diseños dentro del entorno existente del codebase** (React, Vue, SwiftUI, Flutter, native, etc.), respetando los patrones, librerías y design system ya establecidos. Si el proyecto aún no tiene un framework definido, elige el más apropiado.

El HTML usa vanilla JS + SVG, sin frameworks ni librerías externas más allá de Google Fonts (Inter). Toda la lógica de animación está en `<script>` inline para que sea fácil de leer y portar.

## Fidelity
**Alta fidelidad (hi-fi)**. Colores exactos, tipografía, spacing y comportamiento ya están afinados. Recréalo pixel-perfect usando los componentes/tokens del codebase destino.

---

## Pantallas / Vistas

### 1. Card "Ahorro este mes"

**Propósito:** Mostrar el ahorro mensual de agua del usuario respecto a un riego manual de referencia. La gota es la representación visual del consumo actual.

**Layout:**
- Card blanca, `border-radius: 18px`, padding `22px 24px 18px`
- Borde sutil `1px solid #e6ecf3`, sombra suave `0 10px 30px -16px rgba(15,23,42,0.12)`
- Estructura vertical:
  1. **Header** (flex space-between): icono hoja + label `"AHORRO ESTE MES"` (uppercase, 13px, 600, letter-spacing 0.08em, color `#475569`) y chevron a la derecha
  2. **Hero** (grid `var(--drop-col) 1fr`, gap 18px): la gota a la izquierda, la cifra grande + lead + badge a la derecha
  3. **Rows** (4 filas separadas por borde superior `1px solid #e6ecf3`): Usado este mes / Usado hoy / Referencia / Ahorro total (esta última en verde, o rojo si hay exceso)
  4. **Footer:** texto centrado `"Toca para ver detalles"` (color `#2aa5e8`, 13px)

**Componentes y valores:**
- **Cifra grande:** 40px / 800 / `#0f172a` / letter-spacing -0.02em, sufijo `L` en 18px / 600 / `#94a3b8`
- **Lead:** 14px / `#475569` (`"ahorrados vs riego manual diario"` por defecto)
- **Pill (badge):** 6px 12px padding, radius 999px, fondo `#d6f4e6`, texto `#16a36e`, 12.5px / 600. Estados:
  - normal: fondo verde, texto verde, copy `"X% de ahorro"`
  - warn (≥ umbral): fondo `#fff3d6`, texto `#b8861f`, copy `"X% de ahorro · cerca del límite"`
  - danger (≥ 100% consumo): fondo `#ffe1e1`, texto `#b91c1c`, copy `"+N L sobre el límite"`
- **Dot pulse** dentro del pill: 6px círculo currentColor + animation box-shadow pulse 1.6s

### 2. Gota de agua (componente reutilizable)

Es **un SVG paramétrico** generado por JS — NO uses la imagen `gota_agua.png` como fill animable; está incluida solo como referencia visual del estilo de marca.

**ViewBox:** `132 156` (mantenlo fijo; el ancho lo controla el path interno, no el viewBox).

**Path de la gota (función `dropPath(halfWidth)`):**
```js
function dropPath(hw) {
  const cx = 66, top = 6, bot = 148, sideY = 96, bcy = 124;
  const lx = cx - hw, rx = cx + hw;
  const bcx = Math.round(hw * 0.55);
  return `M ${cx} ${top} C ${cx} ${top}, ${lx} 60, ${lx} ${sideY} ` +
         `C ${lx} ${bcy}, ${cx - bcx} ${bot}, ${cx} ${bot} ` +
         `C ${cx + bcx} ${bot}, ${rx} ${bcy}, ${rx} ${sideY} ` +
         `C ${rx} 60, ${cx} ${top}, ${cx} ${top} Z`;
}
```
- `halfWidth` por defecto: **54** (después del tweak final del usuario)
- Aplica el mismo `d` al clipPath, al outline, al brandMark y al SVG del botón de apagado.

**Capas dentro del clip de la gota (de abajo a arriba):**
1. **Fondo "vacío":** rect con gradiente linear vertical `#eaf5ff → #cfe7fb`
2. **Pattern de circuito** (opcional, estético): líneas finas `#7fd0ff` opacity 0.55, puntos `#9fdcff`
3. **Highlights:** dos elipses blancas con opacity 0.18–0.22
4. **Capa de agua** (la animada): dos olas sinusoidales superpuestas
5. **Burbujas** (opcionales): pequeños círculos blancos

**Olas (path animado):**
```js
function buildWave(amplitude, freq, phase, yBase, dir) {
  const W = 132, H = 156;
  const pts = [];
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * W;
    const y = yBase + amplitude * Math.sin(freq * (x / W) * Math.PI * 2 + phase * dir);
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return `M 0 ${H} L 0 ${pts[0].split(',')[1]} L ` + pts.join(' L ') + ` L ${W} ${H} Z`;
}
```
- **Wave front:** `buildWave(amp, 1.6, phase, yBase, +1)`, opacity 1
- **Wave back:** `buildWave(amp * 0.7, 1.2, phase + 1.2, yBase + 3, -1)`, opacity 0.55
- `phase` se incrementa cada frame en `0.035 * waveSpeed`
- `yBase` se calcula a partir del porcentaje de consumo:
  ```js
  const yTop = 14, yBottom = 150;
  const p = Math.max(0, Math.min(1.25, displayedPct / 100));
  const yBase = yBottom - p * (yBottom - yTop);
  ```
- **Suavizado del nivel** (importante para que no salte): `displayedPct += (targetPct - displayedPct) * 0.08;`

**Gradientes del agua:**
- Azul (normal): `linearGradient` vertical `#3fb6f0 → #0b4f88`
- Rojo (exceso): `#ff6a6a → #a31818`
- Cambia el `fill` de `wave-front` y `wave-back` a `url(#waterRed)` cuando `ratio ≥ 1`.

### 3. Botón de apagado

**Layout:** botón sin bordes ni fondo, contiene el SVG de la gota a 92×108px (proporcional al `dropWidth`).

**Contenido de la gota (sin animación de relleno):**
- Fondo: gradiente azul completo `#3fb6f0 → #0b4f88`
- Detalles de circuito decorativos
- **Símbolo de power** centrado en `translate(66, 92)`:
  - Arco: `M -16 -6 A 18 18 0 1 0 16 -6`
  - Vertical: `line x1="0" y1="-22" x2="0" y2="-2"`
  - Stroke `#cfeeff` (azul claro) por defecto, 5px, `stroke-linecap: round`
- **Red glow** detrás del power (circle r=42 en (66,92) con `radial-gradient` rojo, opacity 0 por defecto)

**Estado hover:**
- `transform: translateY(-2px)`
- `filter: drop-shadow(0 10px 20px rgba(226,59,59,0.35))`
- El stroke del símbolo de power pasa a `#ff3838`
- Drop-shadow rojo pulsante sobre el símbolo (animation `powerPulse 1.2s ease-in-out infinite`)
- El red-glow circle se hace visible (opacity 1) y pulsa (`glowPulse 1.4s ease-in-out infinite`)
- El outline de la gota pasa de `#0b4f88` a `#b91c1c`
- Todas las transiciones en **0.35s ease**

---

## Interacciones y comportamiento

### Card – ciclo de vida
1. Al montar la card, el agua arranca a **0 L** y sube con easing cúbico hasta el valor real del mes durante **2500 ms** (intro de entrada).
2. Cuando el padre actualiza el valor de litros consumidos, `setLitros(v)`:
   - Actualiza la cifra grande (`375 - v` o cálculo equivalente de "ahorrados")
   - Actualiza las filas inferiores
   - Cambia estados del pill y del lead text según los thresholds
3. El RAF loop sigue corriendo siempre para mantener las olas en movimiento.

### Thresholds de color
- `ratio < WARN` (default 0.85): azul, pill verde "X% de ahorro"
- `WARN ≤ ratio < 1`: ámbar (`#ffae3b → #b86a07`), outline `#b86a07`, pill ámbar
- `ratio ≥ 1`: rojo (`#ff6a6a → #a31818`), outline `#b91c1c`, card con `animation: alertShake 1.8s ease-in-out infinite`, pill rojo

### Botón de apagado
- Solo `:hover` y `:focus-visible`. No requiere estado en JS — todo se resuelve con CSS transitions y keyframes.
- `focus-visible`: `outline: 2px solid #2aa5e8; outline-offset: 4px; border-radius: 12px`.

### Animaciones (keyframes)
```css
@keyframes dot-pulse {
  0% { box-shadow: 0 0 0 0 currentColor; opacity: .8; }
  80% { box-shadow: 0 0 0 8px transparent; opacity: 0; }
  100% { box-shadow: 0 0 0 0 transparent; opacity: 0; }
}
@keyframes powerPulse {
  0%,100% { filter: drop-shadow(0 0 6px rgba(255,56,56,.9)) drop-shadow(0 0 12px rgba(255,56,56,.55)); }
  50%     { filter: drop-shadow(0 0 10px rgba(255,56,56,1))  drop-shadow(0 0 22px rgba(255,56,56,.8));  }
}
@keyframes glowPulse {
  0%,100% { opacity: .6; }
  50%     { opacity: 1;  }
}
@keyframes alertShake {
  0%,100% { transform: translateX(0); }
  92% { transform: translateX(0); }
  94% { transform: translateX(-2px); }
  96% { transform: translateX(2px); }
  98% { transform: translateX(-1px); }
}
```

---

## State management (qué necesita el componente)

**Inputs (props):**
- `litrosConsumidos: number` – litros consumidos este mes
- `referencia: number` – litros del riego manual de referencia (default **445** después del último ajuste del usuario, valor original 375)
- `warnThreshold: number` – fracción del consumo desde la cual se avisa (default **0.85**)
- Opcional: `dropWidth`, `waveAmp`, `waveSpeed` para afinar la animación (defaults: **54 / 5.5 / 0.5**)
- Opcional: `onShutdown: () => void` para el callback del botón de apagado

**Estado interno:**
- `displayedPct` (number) – % de consumo suavizado para la animación
- `phase` (number) – fase de la onda, incremental en cada frame
- (RAF loop activo mientras el componente esté montado)

---

## Design tokens

### Colores
```
--bg:          #f4f7fb     // fondo de página
--card:        #ffffff
--ink:         #0f172a     // texto principal
--ink-soft:    #475569
--ink-muted:   #94a3b8
--line:        #e6ecf3     // bordes y separadores
--green:       #16a36e     // ahorro / OK
--green-soft:  #d6f4e6
--aqua:        #2aa5e8     // marca / link
--aqua-deep:   #0b4f88
--aqua-dark:   #073764
--danger:      #e23b3b
--danger-deep: #b91c1c
--danger-soft: #ffe1e1
--warn-fill:   #ffae3b
--warn-deep:   #b86a07
--warn-soft:   #fff3d6
```

### Gradientes del agua
- Azul: `linear-gradient(180deg, #3fb6f0 0%, #0b4f88 100%)`
- Rojo: `linear-gradient(180deg, #ff6a6a 0%, #a31818 100%)`

### Tipografía
- Familia: **Inter** (Google Fonts) – pesos 400, 500, 600, 700, 800
- Cifra grande de la card: 40px / 800 / -0.02em
- Header card: 13px / 600 / uppercase / 0.08em
- Body rows: 14.5px / regular

### Espaciado / radii
- Card radius: **18px**
- Pill radius: **999px**
- Button radius (focus outline): **12px**
- Shadow card: `0 1px 0 rgba(15,23,42,.02), 0 10px 30px -16px rgba(15,23,42,.12)`
- Shadow shutdown (default): `drop-shadow(0 8px 14px rgba(11,79,136,.25))`
- Shadow shutdown (hover): `drop-shadow(0 10px 20px rgba(226,59,59,.35))`

### Timing
- Transiciones suaves: **0.35s ease**
- Smoothing del nivel de agua: lerp factor **0.08** por frame
- Intro al montar la card: **2500 ms**, easing `1 - (1-p)^3` (easeOutCubic)
- Pulse del dot: **1.6s**
- powerPulse: **1.2s**, glowPulse: **1.4s**, alertShake: **1.8s**

---

## Assets

Carpeta `assets/`:
- `aquantia_logo.jpeg` – logo completo aquantIAlab (referencia)
- `gota_agua.png` – ilustración de marca de la gota con circuitos (referencia visual; **NO usar como capa de relleno animable**)
- `logo_shutdown.png` – gota con el símbolo de power (referencia visual del botón)
- `icono_logout.png` – icono de logout (no usado en estas dos animaciones, pero queda como referencia)

**Importante:** Las gotas en producción deben construirse con **SVG paramétrico** como se describe arriba, no con las imágenes. Las imágenes están solo para que veas el estilo de marca y mantengas la coherencia visual.

---

## Files

- `Aquantia animaciones.html` – prototipo completo, autocontenido, con ambos componentes y un panel de tweaks. Toda la lógica está comentada inline.
- `assets/` – referencias visuales de marca.

**Cómo leer el prototipo:**
- El bloque `<style>` arriba contiene todos los tokens y la card.
- La función `dropPath()` y `buildWave()` son el núcleo del SVG paramétrico.
- El RAF loop está en `function tick(t)` — empieza a leer ahí para entender cómo se conecta el % de consumo con el nivel del agua y el color.
- El `:hover` del botón de apagado vive 100% en CSS (`.shutdown-btn:hover #powerSym`, etc.).
