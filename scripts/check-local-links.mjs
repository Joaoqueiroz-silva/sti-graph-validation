#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const SKIP = new Set([".git", "node_modules", "tmp"]);

function walk(directory, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute, output);
    else if (entry.isFile() && entry.name.endsWith(".md")) output.push(absolute);
  }
  return output;
}

function cleanTarget(raw) {
  const unwrapped = raw.trim().replace(/^<|>$/g, "").split(/\s+["']/)[0];
  return decodeURIComponent(unwrapped.split("#")[0].split("?")[0]);
}

function isExternal(target) {
  return /^(?:[a-z]+:|#|\/\/)/i.test(target) || target === "";
}

export function checkLocalLinks({ root = REPO } = {}) {
  const broken = [];
  let links = 0;
  for (const file of walk(root)) {
    const body = fs.readFileSync(file, "utf8");
    const candidates = [
      ...body.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g),
      ...body.matchAll(/<(?:a|img)\b[^>]*(?:href|src)=["']([^"']+)["'][^>]*>/gi),
    ];
    for (const match of candidates) {
      const raw = match[1];
      if (isExternal(raw.trim())) continue;
      const target = cleanTarget(raw);
      if (!target || isExternal(target)) continue;
      links++;
      const absolute = target.startsWith("/")
        ? path.resolve(root, target.slice(1))
        : path.resolve(path.dirname(file), target);
      if (!fs.existsSync(absolute)) {
        broken.push({
          file: path.relative(root, file),
          target: raw,
        });
      }
    }
  }
  if (broken.length) {
    throw new Error(
      `Links locais quebrados (${broken.length}):\n${broken
        .map((item) => `- ${item.file} -> ${item.target}`)
        .join("\n")}`
    );
  }
  return { status: "ok", markdownLinksChecked: links, filesChecked: walk(root).length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(checkLocalLinks())}\n`);
}
