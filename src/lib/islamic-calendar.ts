/**
 * Islamic (Hijri) calendar — port of the persian-calendar calendar library
 * + Remote Estehlal overrides from `calendar-sync.json` (v6.7.1 parity).
 */

export const BASE_HIJRI_MONTH_BITS = [
  0b101010010111 /* 1264 */,
  0b101010101010 /* 1265 */,
  0b101011010101 /* 1266 */,
  0b010110010100 /* 1267 */,
  0b101110101010 /* 1268 */,
  0b010110110101 /* 1269 */,
  0b010010110110 /* 1270 */,
  0b101001010111 /* 1271 */,
  0b010100101011 /* 1272 */,
  0b011010100011 /* 1273 */,
  0b011011010001 /* 1274 */,
  0b101011101001 /* 1275 */,
  0b010101101010 /* 1276 */,
  0b101001101101 /* 1277 */,
  0b010100101101 /* 1278 */,
  0b110010010101 /* 1279 */,
  0b111001001010 /* 1280 */,
  0b111010100101 /* 1281 */,
  0b011010110100 /* 1282 */,
  0b100110111010 /* 1283 */,
  0b010100111011 /* 1284 */,
  0b001001011011 /* 1285 */,
  0b010100101011 /* 1286 */,
  0b101001010101 /* 1287 */,
  0b101010101010 /* 1288 */,
  0b101101011001 /* 1289 */,
  0b010101110100 /* 1290 */,
  0b100101111010 /* 1291 */,
  0b010010111010 /* 1292 */,
  0b101001011010 /* 1293 */,
  0b110100110100 /* 1294 */,
  0b111010110001 /* 1295 */,
  0b011011011000 /* 1296 */,
  0b101011101100 /* 1297 */,
  0b010101011100 /* 1298 */,
  0b101001101110 /* 1299 */,
  0b010100110110 /* 1300 */,
  0b101010100110 /* 1301 */,
  0b101101010010 /* 1302 */,
  0b101110101001 /* 1303 */,
  0b001110110100 /* 1304 */,
  0b100111011010 /* 1305 */,
  0b010101011010 /* 1306 */,
  0b101010101010 /* 1307 */,
  0b110101001010 /* 1308 */,
  0b111010100101 /* 1309 */,
  0b011101010010 /* 1310 */,
  0b101101101001 /* 1311 */,
  0b010110110100 /* 1312 */,
  0b101010101101 /* 1313 */,
  0b011001010110 /* 1314 */,
  0b110100100110 /* 1315 */,
  0b111010010010 /* 1316 */,
  0b111101001001 /* 1317 */,
  0b011101010100 /* 1318 */,
  0b101101011010 /* 1319 */,
  0b100110011011 /* 1320 */,
  0b010010011011 /* 1321 */,
  0b100101001011 /* 1322 */,
  0b101100100101 /* 1323 */,
  0b110101010010 /* 1324 */,
  0b110101101010 /* 1325 */,
  0b010101101101 /* 1326 */,
  0b001010110110 /* 1327 */,
  0b101000110111 /* 1328 */,
  0b010010011011 /* 1329 */,
  0b011001001101 /* 1330 */,
  0b011010101010 /* 1331 */,
  0b101101010101 /* 1332 */,
  0b001101011100 /* 1333 */,
  0b100101101110 /* 1334 */,
  0b010010101111 /* 1335 */,
  0b001001010111 /* 1336 */,
  0b001100101011 /* 1337 */,
  0b010110010101 /* 1338 */,
  0b001110101010 /* 1339 */,
  0b010111011001 /* 1340 */,
  0b001011011010 /* 1341 */,
  0b100101011101 /* 1342 */,
  0b001010101011 /* 1343 */,
  0b010101010101 /* 1344 */,
  0b011011001001 /* 1345 */,
  0b011011100100 /* 1346 */,
  0b101101101010 /* 1347 */,
  0b010110110101 /* 1348 */,
  0b001010110110 /* 1349 */,
  0b100110010110 /* 1350 */,
  0b110101001010 /* 1351 */,
  0b110111000101 /* 1352 */,
  0b011101010010 /* 1353 */,
  0b011110100101 /* 1354 */,
  0b001101101010 /* 1355 */,
  0b100110101101 /* 1356 */,
  0b010101001101 /* 1357 */,
  0b101010010101 /* 1358 */,
  0b110101001001 /* 1359 */,
  0b110110100101 /* 1360 */,
  0b010110110010 /* 1361 */,
  0b101011010101 /* 1362 */,
  0b010101010110 /* 1363 */,
  0b101001010111 /* 1364 */,
  0b010100101011 /* 1365 */,
  0b011010010101 /* 1366 */,
  0b101101001010 /* 1367 */,
  0b101101100101 /* 1368 */,
  0b010101101011 /* 1369 */,
  0b001010101101 /* 1370 */,
  0b010101001110 /* 1371 */,
  0b110010010111 /* 1372 */,
  0b010101001011 /* 1373 */,
  0b011010100101 /* 1374 */,
  0b011011010010 /* 1375 */,
  0b101011011001 /* 1376 */,
  0b010011011101 /* 1377 */,
  0b001001010111 /* 1378 */,
  0b100100101101 /* 1379 */,
  0b101010010101 /* 1380 */,
  0b101101010010 /* 1381 */,
  0b101101101001 /* 1382 */,
  0b001101110100 /* 1383 */,
  0b100101110110 /* 1384 */,
  0b010010110111 /* 1385 */,
  0b001001010111 /* 1386 */,
  0b010101001011 /* 1387 */,
  0b011010100101 /* 1388 */,
  0b011011010010 /* 1389 */,
  0b101011101010 /* 1390 */,
  0b010011101101 /* 1391 */,
  0b001001101101 /* 1392 */,
  0b100100110101 /* 1393 */,
  0b110100100101 /* 1394 */,
  0b110101010001 /* 1395 */,
  0b101110101001 /* 1396 */,
  0b010111010100 /* 1397 */,
  0b101010110101 /* 1398 */,
  0b010100110110 /* 1399 */,
  0b101010010111 /* 1400 */,
  0b011001001010 /* 1401 */,
  0b111010100101 /* 1402 */,
  0b011101010010 /* 1403 */,
  0b101110101001 /* 1404 */,
  0b010110110101 /* 1405 */,
  0b001010110101 /* 1406 */,
  0b101001010110 /* 1407 */,
  0b110100100110 /* 1408 */,
  0b111001010011 /* 1409 */,
  0b011010101001 /* 1410 */,
  0b110101010100 /* 1411 */,
  0b110101010110 /* 1412 */,
  0b101001010111 /* 1413 */,
  0b010010100111 /* 1414 */,
  0b110001000111 /* 1415 */,
  0b110100100110 /* 1416 */,
  0b111001010100 /* 1417 */,
  0b110110100110 /* 1418 */,
  0b010101100111 /* 1419 */,
  0b001010110110 /* 1420 */,
  0b100100110111 /* 1421 */,
  0b010010010111 /* 1422 */,
  0b011001010101 /* 1423 */,
  0b101010101010 /* 1424 */,
  0b101101100101 /* 1425 */,
  0b001011101100 /* 1426 */,
  0b100101110101 /* 1427 */,
  0b010001101110 /* 1428 */,
  0b101000110110 /* 1429 */,
  0b110010100110 /* 1430 */,
  0b110101010010 /* 1431 */,
  0b110111010010 /* 1432 */,
  0b010111010101 /* 1433 */,
  0b001011011010 /* 1434 */,
  0b010101011101 /* 1435 */,
  0b010010101011 /* 1436 */,
  0b011010010011 /* 1437 */,
  0b011101001001 /* 1438 */,
  0b011110100100 /* 1439 */,
  0b101110110010 /* 1440 */,
  0b010110110101 /* 1441 */,
  0b001010110110 /* 1442 */,
  0b011001011010 /* 1443 */,
  0b110100101010 /* 1444 */,
  0b111010010100 /* 1445 */,
  0b111011010001 /* 1446 */,
  0b011011101000 /* 1447 */,
  0b101011101010 /* 1448 */,
  0b100101011101 /* 1449 */,
];

const SUPPORTED_START_JDN = 2396005; // 1 Muharram 1264 AH
const SUPPORTED_START_YEAR = 1264;

export let HIJRI_MONTH_BITS: number[] = [...BASE_HIJRI_MONTH_BITS];

function buildMonthOffsets(bitsArr: number[]): Int32Array {
  const out = new Int32Array(bitsArr.length * 12);
  let acc = 0;
  for (let m = 0; m < out.length; m += 1) {
    out[m] = acc;
    const bits = bitsArr[Math.floor(m / 12)];
    acc += (bits >> (11 - (m % 12))) & 1 ? 30 : 29;
  }
  return out;
}

function computeSupportEnd(bitsArr: number[], offsets: Int32Array): number {
  const lastOffset = offsets[offsets.length - 1] ?? 0;
  const lastLen = (bitsArr[bitsArr.length - 1] & 1) === 1 ? 30 : 29;
  return lastOffset + lastLen + SUPPORTED_START_JDN;
}

let monthOffsets = buildMonthOffsets(HIJRI_MONTH_BITS);
let jdnSupportEnd = computeSupportEnd(HIJRI_MONTH_BITS, monthOffsets);

/* Remote Estehlal month/global day offsets */
let _globalHijriDayOffset = 0;
let _hijriMonthDayOffsets: Record<string, number> = {};

export function setHijriDayOffsets(globalOffset: number, monthOffsetsMap: Record<string, number>) {
  _globalHijriDayOffset = globalOffset;
  _hijriMonthDayOffsets = { ...monthOffsetsMap };
}

export function getMonthDayOffset(hy: number, hm: number): number {
  const key = `${String(hy).padStart(4, "0")}-${String(hm).padStart(2, "0")}`;
  return _hijriMonthDayOffsets[key] ?? 0;
}

export function getGlobalHijriDayOffset(): number {
  return _globalHijriDayOffset;
}

/**
 * Rebuilds the Hijri month-length table with remote overrides from `calendar-sync.json`:
 *  - `yearMonths`: 12-element array of (29 or 30) for any Hijri year (including 1450+)
 *  - `monthLengths`: single-month override `"YYYY-MM" -> 29 or 30`
 */
export function rebuildHijriTableWithOverrides(
  yearMonths: Record<number, number[]>,
  monthLengths: Record<string, number>,
): void {
  const maxBaseYear = SUPPORTED_START_YEAR + BASE_HIJRI_MONTH_BITS.length - 1;
  let maxOverrideYear = maxBaseYear;
  for (const k of Object.keys(yearMonths)) {
    const y = Number(k);
    if (Number.isFinite(y) && y > maxOverrideYear) maxOverrideYear = y;
  }
  for (const k of Object.keys(monthLengths)) {
    const y = Number(k.split("-")[0]);
    if (Number.isFinite(y) && y > maxOverrideYear) maxOverrideYear = y;
  }
  const targetMaxYear = Math.max(maxBaseYear, Math.min(1550, maxOverrideYear));
  const totalYears = targetMaxYear - SUPPORTED_START_YEAR + 1;

  const nextBits: number[] = new Array(totalYears);
  for (let idx = 0; idx < totalYears; idx++) {
    const hy = SUPPORTED_START_YEAR + idx;
    if (idx < BASE_HIJRI_MONTH_BITS.length) {
      nextBits[idx] = BASE_HIJRI_MONTH_BITS[idx];
    } else {
      let mask = 0;
      for (let m = 1; m <= 12; m++) {
        const nextJdn = m === 12 ? fallbackIslamicToJdn(hy + 1, 1, 1) : fallbackIslamicToJdn(hy, m + 1, 1);
        const len = nextJdn - fallbackIslamicToJdn(hy, m, 1);
        if (len >= 30) mask |= 1 << (11 - (m - 1));
      }
      nextBits[idx] = mask;
    }
  }

  for (const [hyStr, lengths] of Object.entries(yearMonths)) {
    const hy = Number(hyStr);
    const yIdx = hy - SUPPORTED_START_YEAR;
    if (yIdx >= 0 && yIdx < nextBits.length && Array.isArray(lengths) && lengths.length === 12) {
      let mask = 0;
      for (let mIdx = 0; mIdx < 12; mIdx++) {
        if (lengths[mIdx] >= 30) mask |= 1 << (11 - mIdx);
      }
      nextBits[yIdx] = mask;
    }
  }

  for (const [ymKey, len] of Object.entries(monthLengths)) {
    const parts = ymKey.split("-");
    if (parts.length === 2) {
      const hy = Number(parts[0]);
      const hm = Number(parts[1]);
      const yIdx = hy - SUPPORTED_START_YEAR;
      if (yIdx >= 0 && yIdx < nextBits.length && hm >= 1 && hm <= 12) {
        const bitPos = 11 - (hm - 1);
        if (len >= 30) nextBits[yIdx] |= 1 << bitPos;
        else nextBits[yIdx] &= ~(1 << bitPos);
      }
    }
  }

  const nextOffsets = buildMonthOffsets(nextBits);
  HIJRI_MONTH_BITS = nextBits;
  monthOffsets = nextOffsets;
  jdnSupportEnd = computeSupportEnd(nextBits, nextOffsets);
}

/** Official-table lookup. Returns -1 / null outside supported range. */
export function toIranianIslamicJdn(hy: number, hm: number, hd: number) {
  const yearIndex = hy - SUPPORTED_START_YEAR;
  if (yearIndex < 0 || yearIndex >= HIJRI_MONTH_BITS.length) return -1;
  return monthOffsets[yearIndex * 12 + hm - 1] + hd + SUPPORTED_START_JDN - 1;
}

export function fromIranianIslamicJdn(jdn: number) {
  if (jdn < SUPPORTED_START_JDN || jdn >= jdnSupportEnd) return null;
  const days = jdn - SUPPORTED_START_JDN;
  let index = Math.max(0, Math.min(monthOffsets.length - 1, Math.floor(days / 30)));
  while (index > 0 && monthOffsets[index] > days) index -= 1;
  while (index + 1 < monthOffsets.length && monthOffsets[index + 1] <= days) index += 1;
  const yearIndex = Math.floor(index / 12);
  const month = index % 12;
  const day = days - monthOffsets[index];
  return { hy: yearIndex + SUPPORTED_START_YEAR, hm: month + 1, hd: day + 1 };
}

/* ---------------- astronomical fallback (out of table range) ---------------- */

const NMONTHS = 1405 * 12 + 1;
const D2R = Math.PI / 180;

function floor(d: number) {
  return Math.floor(d);
}

function sinOfDegree(deg: number) {
  return Math.sin(deg * D2R);
}

function tmoonphase(n: number, nph: number) {
  const k = n + nph / 4;
  const T = k / 1236.85;
  const t2 = T * T;
  const t3 = t2 * T;
  const jd =
    2415020.75933 +
    29.53058868 * k -
    0.0001178 * t2 -
    0.000000155 * t3 +
    0.00033 * sinOfDegree(166.56 + 132.87 * T - 0.009173 * t2);
  const sa = (359.2242 + 29.10535608 * k - 0.0000333 * t2 - 0.00000347 * t3) * D2R;
  const ma = (306.0253 + 385.81691806 * k + 0.0107306 * t2 + 0.00001236 * t3) * D2R;
  const tf = 2 * (21.2964 + 390.67050646 * k - 0.0016528 * t2 - 0.00000239 * t3) * D2R;
  const sinSA = Math.sin(sa);
  const sinMA = Math.sin(ma);
  const sinTF = Math.sin(tf);
  let xtra;
  if (nph === 0 || nph === 2) {
    xtra =
      (0.1734 - 0.000393 * T) * sinSA +
      0.0021 * Math.sin(sa * 2) -
      0.4068 * sinMA +
      0.0161 * Math.sin(2 * ma) -
      0.0004 * Math.sin(3 * ma) +
      0.0104 * sinTF -
      0.0051 * Math.sin(sa + ma) -
      0.0074 * Math.sin(sa - ma) +
      0.0004 * Math.sin(tf + sa) -
      0.0004 * Math.sin(tf - sa) -
      0.0006 * Math.sin(tf + ma) +
      0.001 * Math.sin(tf - ma) +
      0.0005 * Math.sin(sa + 2 * ma);
  } else {
    xtra =
      (0.1721 - 0.0004 * T) * sinSA +
      0.0021 * Math.sin(sa * 2) -
      0.628 * sinMA +
      0.0089 * Math.sin(2 * ma) -
      0.0004 * Math.sin(3 * ma) +
      0.0079 * sinTF -
      0.0119 * Math.sin(sa + ma) -
      0.0047 * Math.sin(sa - ma) +
      0.0003 * Math.sin(tf + sa) -
      0.0004 * Math.sin(tf - sa) -
      0.0006 * Math.sin(tf + ma) +
      0.0021 * Math.sin(tf - ma) +
      0.0003 * Math.sin(sa + 2 * ma) +
      0.0004 * Math.sin(sa - 2 * ma) -
      0.0003 * Math.sin(2 * sa + ma) +
      (nph === 1
        ? 0.0028 - 0.0004 * Math.cos(sa) + 0.0003 * Math.cos(ma)
        : -0.0028 + 0.0004 * Math.cos(sa) - 0.0003 * Math.cos(ma));
  }
  return jd + xtra - (0.41 + 1.2053 * T + 0.4992 * t2) / 1440;
}

function visibility(n: number) {
  const TIMZ = 3;
  const MINAGE = 13.5;
  const SUNSET = 19.5;
  const TIMDIF = SUNSET - MINAGE;
  const jd = tmoonphase(n, 0);
  const d = floor(jd);
  let tf = jd - d;
  if (tf <= 0.5) return jd + 1;
  tf = (tf - 0.5) * 24 + TIMZ;
  return tf > TIMDIF ? jd + 1 : jd;
}

export function fallbackIslamicToJdn(hy: number, hm: number, hd: number) {
  let year = hy;
  if (year < 0) year += 1;
  const k = hm + year * 12 - NMONTHS;
  return floor(visibility(k + 1048) + hd + 0.5);
}

export function fallbackIslamicFromJdn(jdn: number) {
  const g = jdnToGregorian(jdn);
  let year = g.gy;
  let month = g.gm;
  const day = g.gd;
  let k = Math.floor(0.6 + (year + (month % 2 === 0 ? month : month - 1) / 12 + day / 365 - 1900) * 12.3685);
  let mjd;
  do {
    mjd = visibility(k);
    k -= 1;
  } while (mjd > jdn - 0.5);
  k += 1;
  const hm = k - 1048;
  year = 1405 + Math.floor(hm / 12);
  month = (hm % 12) + 1;
  if (hm !== 0 && month <= 0) {
    month += 12;
    year -= 1;
  }
  if (year <= 0) year -= 1;
  const hd = Math.floor(jdn - mjd + 0.5);
  return { hy: year, hm: month, hd };
}

/* ---------------- unified API (table first, fallback second, + remote Estehlal offsets) ---------------- */

export function islamicToJdn(hy: number, hm: number, hd: number) {
  const table = toIranianIslamicJdn(hy, hm, hd);
  const baseJdn = table !== -1 ? table : fallbackIslamicToJdn(hy, hm, hd);
  return baseJdn + getMonthDayOffset(hy, hm) + _globalHijriDayOffset;
}

export function jdnToIslamic(jdn: number) {
  const globalOff = _globalHijriDayOffset;
  const baseLookup = fromIranianIslamicJdn(jdn - globalOff) || fallbackIslamicFromJdn(jdn - globalOff);
  const monthOff = getMonthDayOffset(baseLookup.hy, baseLookup.hm);
  if (monthOff === 0) return baseLookup;
  const adjustedJdn = jdn - globalOff - monthOff;
  return fromIranianIslamicJdn(adjustedJdn) || fallbackIslamicFromJdn(adjustedJdn);
}

export function islamicMonthLength(hy: number, hm: number) {
  const yearIndex = hy - SUPPORTED_START_YEAR;
  if (yearIndex >= 0 && yearIndex < HIJRI_MONTH_BITS.length) {
    return (HIJRI_MONTH_BITS[yearIndex] >> (11 - (hm - 1))) & 1 ? 30 : 29;
  }
  const next = hm === 12 ? islamicToJdn(hy + 1, 1, 1) : islamicToJdn(hy, hm + 1, 1);
  return next - islamicToJdn(hy, hm, 1);
}

const UNIX_EPOCH_JDN = 2440588; // JDN of 1970-01-01

export function gregorianToJdn(gy: number, gm: number, gd: number) {
  return Math.floor(Date.UTC(gy, gm - 1, gd) / 86400000) + UNIX_EPOCH_JDN;
}

export function jdnToGregorian(jdn: number) {
  const d = new Date((jdn - UNIX_EPOCH_JDN) * 86400000);
  return { gy: d.getUTCFullYear(), gm: d.getUTCMonth() + 1, gd: d.getUTCDate() };
}

export function weekDayOrdinal(jdn: number) {
  return (jdn + 2) % 7;
}
