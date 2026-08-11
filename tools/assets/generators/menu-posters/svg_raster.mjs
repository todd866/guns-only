// Deterministic, bounded rasterizer for the deliberately small SVG subset used by the Top Gun
// picker cards. It accepts only solid/linear/radial fills on rect/circle/ellipse/straight path
// geometry, plus translate/rotate/scale groups. Unsupported path commands fail closed instead of
// silently producing a different picture. Two-times supersampling is selected by render.mjs.

const attributeMap = (source) => {
  const text = String(source ?? "");
  const result = {};
  const assignment = /([:\w-]+)\s*=\s*"([^"]*)"/y;
  let cursor = 0;
  while (cursor < text.length) {
    const whitespace = /\s*/y;
    whitespace.lastIndex = cursor;
    whitespace.exec(text);
    cursor = whitespace.lastIndex;
    if (cursor >= text.length) break;
    // Attribute captures include the self-closing slash. It is the only non-assignment syntax
    // admitted after the final attribute.
    if (text[cursor] === "/" && !text.slice(cursor + 1).trim()) break;
    assignment.lastIndex = cursor;
    const match = assignment.exec(text);
    if (!match) {
      throw new Error(`unsupported SVG attribute syntax near: ${text.slice(cursor, cursor + 24)}`);
    }
    if (Object.hasOwn(result, match[1])) {
      throw new Error(`duplicate SVG attribute: ${match[1]}`);
    }
    result[match[1]] = match[2];
    cursor = assignment.lastIndex;
  }
  return result;
};

const requireAttributeSubset = (kind, attrs, allowed) => {
  const unsupported = Object.keys(attrs).filter((name) => !allowed.has(name));
  if (unsupported.length) {
    throw new Error(`unsupported ${kind} attribute(s): ${unsupported.join(",")}`);
  }
};

const number = (value, fallback = 0) => {
  if (value === undefined || value === null) return fallback;
  const source = String(value).trim();
  if (!/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(source)) {
    throw new Error(`invalid SVG number: ${value}`);
  }
  const parsed = Number(source);
  if (!Number.isFinite(parsed)) throw new Error(`non-finite SVG number: ${value}`);
  return parsed;
};

const unit = (value, fallback = 0) => {
  if (typeof value !== "string") return fallback;
  if (value.endsWith("%")) return number(value.slice(0, -1), fallback * 100) / 100;
  return number(value, fallback);
};

const color = (value) => {
  const match = /^#([0-9a-f]{6})$/i.exec(value || "");
  if (!match) throw new Error(`unsupported SVG colour: ${value}`);
  return [
    Number.parseInt(match[1].slice(0, 2), 16),
    Number.parseInt(match[1].slice(2, 4), 16),
    Number.parseInt(match[1].slice(4, 6), 16),
    255,
  ];
};

const identity = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });

const multiply = (left, right) => ({
  a: left.a * right.a + left.c * right.b,
  b: left.b * right.a + left.d * right.b,
  c: left.a * right.c + left.c * right.d,
  d: left.b * right.c + left.d * right.d,
  e: left.a * right.e + left.c * right.f + left.e,
  f: left.b * right.e + left.d * right.f + left.f,
});

const transformPoint = (matrix, point) => ({
  x: matrix.a * point.x + matrix.c * point.y + matrix.e,
  y: matrix.b * point.x + matrix.d * point.y + matrix.f,
});

function parseNumberList(source, context) {
  const text = String(source ?? "");
  const values = [];
  const numeric = /[-+]?(?:\d+\.?\d*|\.\d+)/y;
  let cursor = 0;
  let needsSeparator = false;
  while (cursor < text.length) {
    const start = cursor;
    while (cursor < text.length && /\s/.test(text[cursor])) cursor++;
    const hadWhitespace = cursor > start;
    if (cursor >= text.length) break;
    if (needsSeparator) {
      if (text[cursor] === ",") {
        cursor++;
        while (cursor < text.length && /\s/.test(text[cursor])) cursor++;
      } else if (!hadWhitespace) {
        throw new Error(`invalid ${context} number list: ${text}`);
      }
    } else if (text[cursor] === ",") {
      throw new Error(`invalid ${context} number list: ${text}`);
    }
    numeric.lastIndex = cursor;
    const match = numeric.exec(text);
    if (!match) throw new Error(`invalid ${context} number list: ${text}`);
    values.push(number(match[0]));
    cursor = numeric.lastIndex;
    needsSeparator = true;
  }
  return values;
}

function parseTransform(source = "") {
  let matrix = identity();
  let consumed = 0;
  for (const match of source.matchAll(/(translate|rotate|scale)\s*\(([^)]*)\)/g)) {
    if (source.slice(consumed, match.index).trim()) {
      throw new Error(`unsupported SVG transform syntax: ${source}`);
    }
    const values = parseNumberList(match[2], "SVG transform");
    let next;
    if (match[1] === "translate") {
      if (values.length < 1 || values.length > 2)
        throw new Error("translate requires one or two operands");
      next = { a: 1, b: 0, c: 0, d: 1, e: values[0], f: values[1] ?? 0 };
    } else if (match[1] === "scale") {
      if (values.length < 1 || values.length > 2)
        throw new Error("scale requires one or two operands");
      next = { a: values[0], b: 0, c: 0, d: values[1] ?? values[0], e: 0, f: 0 };
    } else {
      if (values.length !== 1) throw new Error("rotate about a point is outside the poster subset");
      const radians = values[0] * Math.PI / 180;
      next = {
        a: Math.cos(radians), b: Math.sin(radians),
        c: -Math.sin(radians), d: Math.cos(radians), e: 0, f: 0,
      };
    }
    matrix = multiply(matrix, next);
    consumed = match.index + match[0].length;
  }
  if (source.slice(consumed).trim())
    throw new Error(`unsupported SVG transform syntax: ${source}`);
  return matrix;
}

function parseGradients(svg) {
  const gradients = new Map();
  for (const match of svg.matchAll(/<(linearGradient|radialGradient)\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
    const attrs = attributeMap(match[2]);
    requireAttributeSubset(match[1], attrs, match[1] === "linearGradient"
      ? new Set(["id", "x1", "y1", "x2", "y2"])
      : new Set(["id", "cx", "cy", "r"]));
    if (!attrs.id) throw new Error("SVG gradient requires an id");
    const stops = [];
    for (const stop of match[3].matchAll(/<stop\b([^>]*)\/?\s*>/g)) {
      const stopAttrs = attributeMap(stop[1]);
      requireAttributeSubset("stop", stopAttrs,
        new Set(["offset", "stop-color", "stop-opacity"]));
      const rgba = color(stopAttrs["stop-color"]);
      rgba[3] = Math.round(255 * Math.max(0, Math.min(1, number(stopAttrs["stop-opacity"], 1))));
      stops.push({ offset: unit(stopAttrs.offset), rgba });
    }
    const unsupportedBody = match[3]
      .replace(/<stop\b[^>]*\/?\s*>/g, "")
      .trim();
    if (unsupportedBody) {
      throw new Error(`unsupported ${match[1]} content: ${unsupportedBody.slice(0, 24)}`);
    }
    if (stops.length < 2) throw new Error(`gradient ${attrs.id} requires at least two stops`);
    if (gradients.has(attrs.id)) throw new Error(`duplicate SVG gradient: ${attrs.id}`);
    if (match[1] === "linearGradient") {
      const vector = [unit(attrs.x1, 0), unit(attrs.y1, 0),
        unit(attrs.x2, 0), unit(attrs.y2, 1)];
      if (vector.some((value, index) => value !== [0, 0, 0, 1][index])) {
        throw new Error("only top-to-bottom linear gradients are in the poster subset");
      }
    }
    const radius = unit(attrs.r, 0.5);
    if (match[1] === "radialGradient" && radius <= 0)
      throw new Error("radial gradient radius must be positive");
    stops.sort((left, right) => left.offset - right.offset);
    gradients.set(attrs.id, Object.freeze({
      type: match[1] === "linearGradient" ? "linear" : "radial",
      cx: unit(attrs.cx, 0.5),
      cy: unit(attrs.cy, 0.5),
      radius,
      stops,
    }));
  }
  return gradients;
}

function parsePath(data) {
  if (typeof data !== "string" || !data.trim())
    throw new Error("filled SVG path requires non-empty data");
  if (data.includes(","))
    throw new Error("comma-separated path data is outside the poster subset");
  const tokens = [];
  const token = /[MLHVZ]|[-+]?(?:\d+\.?\d*|\.\d+)/y;
  let cursor = 0;
  while (cursor < data.length) {
    while (cursor < data.length && /\s/.test(data[cursor])) cursor++;
    if (cursor >= data.length) break;
    token.lastIndex = cursor;
    const match = token.exec(data);
    if (!match) {
      throw new Error(`unsupported SVG path syntax near: ${data.slice(cursor, cursor + 24)}`);
    }
    tokens.push(match[0]);
    cursor = token.lastIndex;
  }
  const points = [];
  let command = null;
  let x = 0;
  let y = 0;
  let index = 0;
  while (index < tokens.length) {
    if (/^[MLHVZ]$/.test(tokens[index])) {
      command = tokens[index++];
      if (command === "Z") {
        if (index !== tokens.length)
          throw new Error("SVG path data after close is outside the poster subset");
        break;
      }
    }
    if (!command) throw new Error("SVG path data must start with a command");
    if (command === "M" || command === "L") {
      if (index + 1 >= tokens.length) throw new Error("incomplete SVG path coordinate");
      x = number(tokens[index++]);
      y = number(tokens[index++]);
      points.push({ x, y });
      if (command === "M") command = "L";
    } else if (command === "H") {
      if (index >= tokens.length) throw new Error("incomplete SVG path coordinate");
      x = number(tokens[index++]);
      points.push({ x, y });
    } else if (command === "V") {
      if (index >= tokens.length) throw new Error("incomplete SVG path coordinate");
      y = number(tokens[index++]);
      points.push({ x, y });
    } else {
      throw new Error(`unsupported SVG path command: ${command}`);
    }
  }
  if (points.length < 3) throw new Error("filled SVG path needs at least three points");
  return points;
}

const interpolate = (gradient, position) => {
  const value = Math.max(0, Math.min(1, position));
  let rightIndex = gradient.stops.findIndex((stop) => stop.offset >= value);
  if (rightIndex < 0) rightIndex = gradient.stops.length - 1;
  if (rightIndex === 0) return gradient.stops[0].rgba;
  const left = gradient.stops[rightIndex - 1];
  const right = gradient.stops[rightIndex];
  const amount = (value - left.offset) / Math.max(1e-9, right.offset - left.offset);
  return left.rgba.map((channel, index) =>
    Math.round(channel + (right.rgba[index] - channel) * amount));
};

function paintFor(fill, opacity, gradients) {
  const reference = /^url\(#([^)]+)\)$/.exec(fill || "");
  const gradient = reference ? gradients.get(reference[1]) : null;
  if (reference && !gradient) throw new Error(`unknown SVG gradient: ${reference[1]}`);
  const solid = gradient ? null : color(fill);
  return (u, v) => {
    const radialDistance = gradient?.type === "radial"
      ? Math.hypot(u - gradient.cx, v - gradient.cy) / gradient.radius
      : v;
    const rgba = gradient ? interpolate(gradient, radialDistance) : solid;
    return [rgba[0], rgba[1], rgba[2], Math.round(rgba[3] * opacity)];
  };
}

const blend = (pixels, width, x, y, rgba) => {
  const offset = (y * width + x) * 4;
  const sourceAlpha = rgba[3] / 255;
  const destinationAlpha = pixels[offset + 3] / 255;
  const alpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha);
  if (alpha <= 1e-12) return;
  for (let channel = 0; channel < 3; channel++) {
    pixels[offset + channel] = Math.round(
      (rgba[channel] * sourceAlpha
        + pixels[offset + channel] * destinationAlpha * (1 - sourceAlpha)) / alpha);
  }
  pixels[offset + 3] = Math.round(alpha * 255);
};

function fillPolygon(pixels, width, height, points, paint) {
  const minX = Math.max(0, Math.floor(Math.min(...points.map((point) => point.x))));
  const maxX = Math.min(width - 1, Math.ceil(Math.max(...points.map((point) => point.x))));
  const minY = Math.max(0, Math.floor(Math.min(...points.map((point) => point.y))));
  const maxY = Math.min(height - 1, Math.ceil(Math.max(...points.map((point) => point.y))));
  const spanX = Math.max(1, maxX - minX + 1);
  const spanY = Math.max(1, maxY - minY + 1);
  for (let y = minY; y <= maxY; y++) {
    const sampleY = y + 0.5;
    const intersections = [];
    for (let edge = 0; edge < points.length; edge++) {
      const left = points[edge];
      const right = points[(edge + 1) % points.length];
      if (!((left.y <= sampleY && right.y > sampleY)
        || (right.y <= sampleY && left.y > sampleY))) continue;
      intersections.push(left.x
        + (sampleY - left.y) * (right.x - left.x) / (right.y - left.y));
    }
    intersections.sort((left, right) => left - right);
    for (let pair = 0; pair + 1 < intersections.length; pair += 2) {
      const start = Math.max(minX, Math.ceil(intersections[pair] - 0.5));
      const end = Math.min(maxX, Math.floor(intersections[pair + 1] - 0.5));
      for (let x = start; x <= end; x++) {
        blend(pixels, width, x, y,
          paint((x + 0.5 - minX) / spanX, (y + 0.5 - minY) / spanY));
      }
    }
  }
}

function fillEllipse(pixels, width, height, cx, cy, rx, ry, paint) {
  const minX = Math.max(0, Math.floor(cx - rx));
  const maxX = Math.min(width - 1, Math.ceil(cx + rx));
  const minY = Math.max(0, Math.floor(cy - ry));
  const maxY = Math.min(height - 1, Math.ceil(cy + ry));
  for (let y = minY; y <= maxY; y++) {
    const v = (y + 0.5 - (cy - ry)) / (2 * ry);
    const dy = (y + 0.5 - cy) / ry;
    for (let x = minX; x <= maxX; x++) {
      const dx = (x + 0.5 - cx) / rx;
      if (dx * dx + dy * dy > 1) continue;
      const u = (x + 0.5 - (cx - rx)) / (2 * rx);
      blend(pixels, width, x, y, paint(u, v));
    }
  }
}

export function renderSvgRgba(svg, outputWidth, outputHeight) {
  if (!Number.isInteger(outputWidth) || outputWidth < 1
    || !Number.isInteger(outputHeight) || outputHeight < 1) {
    throw new TypeError("SVG output dimensions must be positive integers");
  }
  const withoutComments = String(svg).replace(/<!--[\s\S]*?-->/g, "");
  const root = /<svg\b([^>]*)>/.exec(withoutComments);
  if (!root) throw new Error("missing SVG root");
  if ([...withoutComments.matchAll(/<svg\b/g)].length !== 1
    || [...withoutComments.matchAll(/<\/svg\s*>/g)].length !== 1) {
    throw new Error("poster SVG requires exactly one root");
  }
  const rootAttrs = attributeMap(root[1]);
  requireAttributeSubset("svg", rootAttrs,
    new Set(["xmlns", "viewBox", "width", "height"]));
  const viewBox = parseNumberList(rootAttrs.viewBox, "SVG viewBox");
  if (viewBox.length !== 4 || viewBox.some((value) => !Number.isFinite(value))
    || viewBox[0] !== 0 || viewBox[1] !== 0 || viewBox[2] <= 0 || viewBox[3] <= 0) {
    throw new Error("poster SVG requires a positive zero-origin viewBox");
  }
  for (const dimension of [rootAttrs.width, rootAttrs.height]) {
    if (dimension !== undefined && number(dimension) <= 0)
      throw new Error("poster SVG dimensions must be positive");
  }
  const scaleX = outputWidth / viewBox[2];
  const scaleY = outputHeight / viewBox[3];
  const rootMatrix = { a: scaleX, b: 0, c: 0, d: scaleY, e: 0, f: 0 };
  const defsBlocks = [...withoutComments.matchAll(/<defs\b([^>]*)>([\s\S]*?)<\/defs>/g)];
  for (const defs of defsBlocks) {
    requireAttributeSubset("defs", attributeMap(defs[1]), new Set());
    for (const child of defs[2].matchAll(/<(?!\/)([A-Za-z][\w:-]*)\b/g)) {
      if (!["linearGradient", "radialGradient", "stop"].includes(child[1])) {
        throw new Error(`unsupported SVG defs element: ${child[1]}`);
      }
    }
    const residue = defs[2]
      .replace(/<(linearGradient|radialGradient)\b[^>]*>[\s\S]*?<\/\1>/g, "")
      .trim();
    if (residue) throw new Error(`unsupported SVG defs content: ${residue.slice(0, 24)}`);
  }
  const gradients = parseGradients(withoutComments);
  const markup = withoutComments.replace(/<defs\b[\s\S]*?<\/defs>/g, "");
  if (/<\/?defs\b/.test(markup)) throw new Error("malformed SVG defs block");
  const allowedElements = new Set(["svg", "g", "rect", "circle", "ellipse", "path"]);
  for (const match of markup.matchAll(/<(?!\/)([A-Za-z][\w:-]*)\b/g)) {
    if (!allowedElements.has(match[1])) {
      throw new Error(`unsupported SVG element: ${match[1]}`);
    }
  }
  const unsupportedMarkup = markup
    .replace(/<\/?svg\b[^>]*>/g, "")
    .replace(/<\/?g\b[^>]*>/g, "")
    .replace(/<(?:rect|circle|ellipse|path)\b[^>]*\/?\s*>/g, "")
    .trim();
  if (unsupportedMarkup) {
    throw new Error(`unsupported SVG content: ${unsupportedMarkup.slice(0, 24)}`);
  }
  const pixels = new Uint8Array(outputWidth * outputHeight * 4);
  const stack = [rootMatrix];
  const drawTokens = markup.match(/<\/?g\b[^>]*>|<(?:rect|circle|ellipse|path)\b[^>]*\/?\s*>/g) ?? [];
  for (const token of drawTokens) {
    if (/^<g\b/.test(token)) {
      const attrs = attributeMap(/^<g\b([^>]*)>$/.exec(token)?.[1]);
      requireAttributeSubset("g", attrs, new Set(["transform"]));
      stack.push(multiply(stack.at(-1), parseTransform(attrs.transform)));
      continue;
    }
    if (/^<\/g/.test(token)) {
      if (!/^<\/g\s*>$/.test(token))
        throw new Error(`unsupported SVG group close: ${token}`);
      if (stack.length === 1) throw new Error("unbalanced SVG group close");
      stack.pop();
      continue;
    }
    const shape = /^<(rect|circle|ellipse|path)\b([^>]*)>$/.exec(token);
    const tag = shape?.[1];
    if (!tag) throw new Error(`unsupported SVG draw token: ${token}`);
    const attrs = attributeMap(shape[2]);
    const shapeAttributes = {
      path: new Set(["d", "fill", "opacity"]),
      rect: new Set(["x", "y", "width", "height", "fill", "opacity"]),
      circle: new Set(["cx", "cy", "r", "fill", "opacity"]),
      ellipse: new Set(["cx", "cy", "rx", "ry", "fill", "opacity"]),
    };
    requireAttributeSubset(tag, attrs, shapeAttributes[tag]);
    const opacity = Math.max(0, Math.min(1, number(attrs.opacity, 1)));
    const paint = paintFor(attrs.fill, opacity, gradients);
    const matrix = stack.at(-1);
    if (tag === "path") {
      const points = parsePath(attrs.d).map((point) => transformPoint(matrix, point));
      fillPolygon(pixels, outputWidth, outputHeight, points, paint);
    } else if (tag === "rect") {
      const x = number(attrs.x);
      const y = number(attrs.y);
      const rectWidth = number(attrs.width);
      const rectHeight = number(attrs.height);
      if (rectWidth <= 0 || rectHeight <= 0)
        throw new Error("SVG rect dimensions must be positive");
      const points = [
        { x, y }, { x: x + rectWidth, y },
        { x: x + rectWidth, y: y + rectHeight }, { x, y: y + rectHeight },
      ].map((point) => transformPoint(matrix, point));
      fillPolygon(pixels, outputWidth, outputHeight, points, paint);
    } else {
      if (Math.abs(matrix.b) > 1e-12 || Math.abs(matrix.c) > 1e-12) {
        throw new Error("transformed ellipses are outside the poster SVG subset");
      }
      const cx = matrix.a * number(attrs.cx) + matrix.e;
      const cy = matrix.d * number(attrs.cy) + matrix.f;
      const rx = Math.abs(matrix.a * number(tag === "circle" ? attrs.r : attrs.rx));
      const ry = Math.abs(matrix.d * number(tag === "circle" ? attrs.r : attrs.ry));
      if (rx <= 0 || ry <= 0) throw new Error("SVG ellipse radii must be positive");
      fillEllipse(pixels, outputWidth, outputHeight, cx, cy, rx, ry, paint);
    }
  }
  if (stack.length !== 1) throw new Error("unbalanced SVG group open");
  return pixels;
}
