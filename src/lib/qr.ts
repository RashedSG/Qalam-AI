/**
 * مولّد رمز QR (نمط البايت، مستوى تصحيح M، الإصدارات ١..١٠).
 *
 * لماذا بأيدينا لا بمكتبة؟ الرمز يُطبع على وثيقة رسمية ويُحمَّل داخل الصفحة،
 * فلا نريد اعتمادًا خارجيًا في مسار الطباعة ولا صورة تُجلَب من نطاق آخر —
 * سياسة أمن المحتوى تحجب الخارجية أصلًا. والمولّد هنا مُختبَر مقابل متجهات
 * مرجعية مولَّدة بمكتبة مستقلة (segno) في `src/test/qr.test.ts`.
 *
 * لا يُستخدم لأي غرض أمني: الرمز يحمل رابط تحقق علنيًّا لا أكثر.
 */

const EC_LEVEL_M = 0b00

/** [عدد رموز التصحيح لكل كتلة, [عدد الكتل, بيانات الكتلة]...] لكل إصدار عند المستوى M. */
const EC_TABLE_M: Record<number, { ecPerBlock: number; groups: Array<[number, number]> }> = {
  1: { ecPerBlock: 10, groups: [[1, 16]] },
  2: { ecPerBlock: 16, groups: [[1, 28]] },
  3: { ecPerBlock: 26, groups: [[1, 44]] },
  4: { ecPerBlock: 18, groups: [[2, 32]] },
  5: { ecPerBlock: 24, groups: [[2, 43]] },
  6: { ecPerBlock: 16, groups: [[4, 27]] },
  7: { ecPerBlock: 18, groups: [[4, 31]] },
  8: { ecPerBlock: 22, groups: [[2, 38], [2, 39]] },
  9: { ecPerBlock: 22, groups: [[3, 36], [2, 37]] },
  10: { ecPerBlock: 26, groups: [[4, 43], [1, 44]] },
}

const ALIGNMENT_CENTERS: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
}

const dataCapacity = (version: number) =>
  EC_TABLE_M[version].groups.reduce((sum, [count, size]) => sum + count * size, 0)

/* ------------------------------ GF(256) ------------------------------ */

const EXP = new Uint8Array(512)
const LOG = new Uint8Array(256)
;(() => {
  let x = 1
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x
    LOG[x] = i
    x <<= 1
    if (x & 0x100) x ^= 0x11d
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255]
})()

const gfMul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]])

/** متعدد حدود المولّد لعدد معيّن من رموز التصحيح. */
function generatorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1])
  for (let i = 0; i < degree; i += 1) {
    const next = new Uint8Array(poly.length + 1)
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= poly[j]
      next[j + 1] ^= gfMul(poly[j], EXP[i])
    }
    poly = next
  }
  return poly
}

function reedSolomon(data: Uint8Array, ecLength: number): Uint8Array {
  const gen = generatorPoly(ecLength)
  const result = new Uint8Array(ecLength)
  for (const byte of data) {
    const factor = byte ^ result[0]
    result.copyWithin(0, 1)
    result[ecLength - 1] = 0
    if (factor !== 0) {
      for (let i = 0; i < ecLength; i += 1) result[i] ^= gfMul(gen[i + 1], factor)
    }
  }
  return result
}

/* ------------------------------ BCH ------------------------------ */

function bch(value: number, generator: number, dataBits: number, totalBits: number): number {
  let rest = value << (totalBits - dataBits)
  const genBits = 32 - Math.clz32(generator)
  while (32 - Math.clz32(rest) >= genBits) {
    rest ^= generator << (32 - Math.clz32(rest) - genBits)
  }
  return (value << (totalBits - dataBits)) | rest
}

const formatBits = (mask: number) => bch((EC_LEVEL_M << 3) | mask, 0x537, 5, 15) ^ 0x5412
const versionBits = (version: number) => bch(version, 0x1f25, 6, 18)

/* --------------------------- تجميع البتّات --------------------------- */

class BitBuffer {
  readonly bits: number[] = []

  push(value: number, length: number) {
    for (let i = length - 1; i >= 0; i -= 1) this.bits.push((value >>> i) & 1)
  }
}

function encodeData(bytes: Uint8Array, version: number): Uint8Array {
  const capacity = dataCapacity(version)
  const buffer = new BitBuffer()
  buffer.push(0b0100, 4) // نمط البايت
  buffer.push(bytes.length, version >= 10 ? 16 : 8)
  for (const byte of bytes) buffer.push(byte, 8)

  const totalBits = capacity * 8
  const terminator = Math.min(4, totalBits - buffer.bits.length)
  buffer.push(0, terminator)
  while (buffer.bits.length % 8 !== 0) buffer.bits.push(0)

  const codewords = new Uint8Array(capacity)
  for (let i = 0; i < buffer.bits.length; i += 8) {
    let byte = 0
    for (let j = 0; j < 8; j += 1) byte = (byte << 1) | buffer.bits[i + j]
    codewords[i / 8] = byte
  }
  // حشو متناوب حسب المواصفة.
  for (let i = buffer.bits.length / 8, pad = 0; i < capacity; i += 1, pad += 1) {
    codewords[i] = pad % 2 === 0 ? 0xec : 0x11
  }
  return codewords
}

/** يقسّم إلى كتل، يحسب التصحيح، ثم يتشابك حسب المواصفة. */
function interleave(codewords: Uint8Array, version: number): Uint8Array {
  const { ecPerBlock, groups } = EC_TABLE_M[version]
  const dataBlocks: Uint8Array[] = []
  const ecBlocks: Uint8Array[] = []
  let offset = 0
  for (const [count, size] of groups) {
    for (let i = 0; i < count; i += 1) {
      const block = codewords.slice(offset, offset + size)
      offset += size
      dataBlocks.push(block)
      ecBlocks.push(reedSolomon(block, ecPerBlock))
    }
  }

  const out: number[] = []
  const maxData = Math.max(...dataBlocks.map((b) => b.length))
  for (let i = 0; i < maxData; i += 1) {
    for (const block of dataBlocks) if (i < block.length) out.push(block[i])
  }
  for (let i = 0; i < ecPerBlock; i += 1) {
    for (const block of ecBlocks) out.push(block[i])
  }
  return Uint8Array.from(out)
}

/* ------------------------------ المصفوفة ------------------------------ */

type Matrix = Int8Array[] // ‎-1 فارغ، 0 فاتح، 1 داكن

function emptyMatrix(size: number): Matrix {
  return Array.from({ length: size }, () => new Int8Array(size).fill(-1))
}

function placeFunctionPatterns(matrix: Matrix, version: number) {
  const size = matrix.length

  const finder = (row: number, col: number) => {
    for (let r = -1; r <= 7; r += 1) {
      for (let c = -1; c <= 7; c += 1) {
        const y = row + r
        const x = col + c
        if (y < 0 || y >= size || x < 0 || x >= size) continue
        const inRing = (r >= 0 && r <= 6 && (c === 0 || c === 6)) || (c >= 0 && c <= 6 && (r === 0 || r === 6))
        const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4
        matrix[y][x] = inRing || inCore ? 1 : 0
      }
    }
  }
  finder(0, 0)
  finder(0, size - 7)
  finder(size - 7, 0)

  for (let i = 8; i < size - 8; i += 1) {
    const value = i % 2 === 0 ? 1 : 0
    matrix[6][i] = value
    matrix[i][6] = value
  }

  const centers = ALIGNMENT_CENTERS[version]
  const last = centers[centers.length - 1]
  for (const row of centers) {
    for (const col of centers) {
      // تُحذف الزوايا الثلاث التي تشغلها أنماط التموضع فقط. الأنماط الواقعة
      // على صفّ التوقيت أو عموده تُرسم فوقه — واستثناؤها خطأ لا يظهر قبل
      // الإصدار السابع، لأن الإصدارات الأدنى ليس فيها إلا مركزٌ واحد صالح.
      const finderCorner =
        (row === 6 && col === 6) || (row === 6 && col === last) || (row === last && col === 6)
      if (finderCorner) continue
      for (let r = -2; r <= 2; r += 1) {
        for (let c = -2; c <= 2; c += 1) {
          matrix[row + r][col + c] = Math.max(Math.abs(r), Math.abs(c)) !== 1 ? 1 : 0
        }
      }
    }
  }

  matrix[size - 8][8] = 1 // الوحدة الداكنة

  // مواضع معلومات النسق تُحجز الآن وتُملأ بعد اختيار القناع.
  for (let i = 0; i <= 8; i += 1) {
    if (matrix[8][i] === -1) matrix[8][i] = 0
    if (matrix[i][8] === -1) matrix[i][8] = 0
  }
  for (let i = 0; i < 8; i += 1) {
    if (matrix[8][size - 1 - i] === -1) matrix[8][size - 1 - i] = 0
    if (matrix[size - 1 - i][8] === -1) matrix[size - 1 - i][8] = 0
  }

  if (version >= 7) {
    const bits = versionBits(version)
    for (let i = 0; i < 18; i += 1) {
      const bit = (bits >>> i) & 1
      matrix[Math.floor(i / 3)][size - 11 + (i % 3)] = bit
      matrix[size - 11 + (i % 3)][Math.floor(i / 3)] = bit
    }
  }
}

function reservedMask(version: number, size: number): boolean[][] {
  const probe = emptyMatrix(size)
  placeFunctionPatterns(probe, version)
  return probe.map((row) => Array.from(row, (cell) => cell !== -1))
}

function placeData(matrix: Matrix, reserved: boolean[][], data: Uint8Array) {
  const size = matrix.length
  let bitIndex = 0
  let upward = true
  for (let right = size - 1; right >= 1; right -= 2) {
    // العمود ٦ توقيتي: كل الأعمدة على يساره تنزاح واحدًا.
    const col = right <= 6 ? right - 1 : right
    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step
      for (const x of [col, col - 1]) {
        if (reserved[row][x]) continue
        const byte = data[bitIndex >>> 3]
        const bit = byte === undefined ? 0 : (byte >>> (7 - (bitIndex & 7))) & 1
        matrix[row][x] = bit
        bitIndex += 1
      }
    }
    upward = !upward
  }
}

const maskFn = (mask: number, row: number, col: number): boolean => {
  switch (mask) {
    case 0: return (row + col) % 2 === 0
    case 1: return row % 2 === 0
    case 2: return col % 3 === 0
    case 3: return (row + col) % 3 === 0
    case 4: return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0
    case 5: return ((row * col) % 2) + ((row * col) % 3) === 0
    case 6: return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0
    default: return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0
  }
}

function penalty(matrix: Matrix): number {
  const size = matrix.length
  let score = 0

  // القاعدة ١: خمس وحدات متجاورة بلون واحد فأكثر.
  for (let i = 0; i < size; i += 1) {
    for (const isRow of [true, false]) {
      let run = 1
      for (let j = 1; j < size; j += 1) {
        const prev = isRow ? matrix[i][j - 1] : matrix[j - 1][i]
        const cur = isRow ? matrix[i][j] : matrix[j][i]
        if (cur === prev) {
          run += 1
          if (run === 5) score += 3
          else if (run > 5) score += 1
        } else run = 1
      }
    }
  }

  // القاعدة ٢: مربّعات ٢×٢ بلون واحد.
  for (let r = 0; r < size - 1; r += 1) {
    for (let c = 0; c < size - 1; c += 1) {
      const v = matrix[r][c]
      if (v === matrix[r][c + 1] && v === matrix[r + 1][c] && v === matrix[r + 1][c + 1]) score += 3
    }
  }

  // القاعدة ٣: نمط ١٠١١١٠١ تسبقه أو تتبعه أربع وحدات فاتحة.
  // المنطقة الهادئة حول الرمز فاتحة، فالنمط الملاصق للحافة يُحتسب أيضًا —
  // وإغفال ذلك يجعل اختيار القناع يخالف المواصفة في رموزٍ كثيرة.
  const finderLike = [1, 0, 1, 1, 1, 0, 1]
  const scanLine = (at: (k: number) => number): number => {
    let total = 0
    let i = 0
    while (i <= size - 7) {
      let matched = true
      for (let k = 0; k < 7; k += 1) {
        if (at(i + k) !== finderLike[k]) {
          matched = false
          break
        }
      }
      if (!matched) {
        i += 1
        continue
      }
      let lightBefore = true
      for (let k = Math.max(i - 4, 0); k < i; k += 1) if (at(k) === 1) lightBefore = false
      let lightAfter = true
      for (let k = i + 7; k < Math.min(i + 11, size); k += 1) if (at(k) === 1) lightAfter = false
      if (i === 0 || i === size - 7 || lightBefore || lightAfter) {
        total += 40
        i += 7
      } else {
        // الوحدات الداكنة الثلاث الوسطى قد تبدأ تطابقًا تاليًا.
        i += 4
      }
    }
    return total
  }
  for (let i = 0; i < size; i += 1) {
    score += scanLine((k) => matrix[i][k])
    score += scanLine((k) => matrix[k][i])
  }

  // القاعدة ٤: انحراف نسبة الوحدات الداكنة عن النصف.
  let dark = 0
  for (const row of matrix) for (const cell of row) if (cell === 1) dark += 1
  const ratio = (dark * 100) / (size * size)
  score += Math.floor(Math.abs(ratio - 50) / 5) * 10

  return score
}

export interface QrCode {
  size: number
  version: number
  mask: number
  /** صفٌّ لكل سطر: true داكن. */
  modules: boolean[][]
}

/**
 * يبني رمز QR لنصٍّ نصيّ (UTF-8). يرمي إن تجاوز النص سعة الإصدار ١٠.
 * `forceMask` للاختبار فقط: يقارن المصفوفة بقناعٍ بعينه مقابل مرجع مستقل.
 */
export function encodeQr(text: string, forceMask?: number): QrCode {
  const bytes = new TextEncoder().encode(text)

  let version = 0
  for (let v = 1; v <= 10; v += 1) {
    const headerBytes = v >= 10 ? 3 : 2 // ٤ بت نمط + عدّاد، مقرّبة لأعلى
    if (bytes.length + headerBytes <= dataCapacity(v)) {
      version = v
      break
    }
  }
  if (version === 0) throw new Error('qr: text too long')

  const size = 17 + version * 4
  const codewords = interleave(encodeData(bytes, version), version)
  const reserved = reservedMask(version, size)

  let best: { matrix: Matrix; mask: number; score: number } | null = null
  for (let mask = 0; mask < 8; mask += 1) {
    if (forceMask !== undefined && mask !== forceMask) continue
    const matrix = emptyMatrix(size)
    placeFunctionPatterns(matrix, version)
    placeData(matrix, reserved, codewords)
    for (let r = 0; r < size; r += 1) {
      for (let c = 0; c < size; c += 1) {
        if (!reserved[r][c] && maskFn(mask, r, c)) matrix[r][c] ^= 1
      }
    }
    writeFormat(matrix, mask)
    const score = penalty(matrix)
    if (!best || score < best.score) best = { matrix, mask, score }
  }

  const chosen = best!
  return {
    size,
    version,
    mask: chosen.mask,
    modules: chosen.matrix.map((row) => Array.from(row, (cell) => cell === 1)),
  }
}

function writeFormat(matrix: Matrix, mask: number) {
  const size = matrix.length
  const bits = formatBits(mask)
  // البتّة ٠ هي الأدنى، وترتيبها في المصفوفة معكوسٌ بين النسختين — وهو
  // بالضبط ما أخطأتُ فيه أولًا فخرج رمزٌ لا يُقرأ رغم صحّة بقيته.
  for (let i = 0; i < 15; i += 1) {
    const bit = ((bits >>> i) & 1) as 0 | 1
    // النسخة الأولى: عمودٌ صاعد ثم صفٌّ متجه لليسار حول النمط الأعلى الأيسر.
    if (i < 6) matrix[i][8] = bit
    else if (i === 6) matrix[7][8] = bit
    else if (i === 7) matrix[8][8] = bit
    else if (i === 8) matrix[8][7] = bit
    else matrix[8][14 - i] = bit
    // النسخة الثانية: ترتيبها معكوسٌ عن الأولى — الأعلى دلالةً أسفل الرمز.
    // موضع الوحدة الداكنة (size-8, 8) خارج النطاقين عن قصد.
    if (i >= 8) matrix[size - 15 + i][8] = bit
    else matrix[8][size - 1 - i] = bit
  }
  matrix[size - 8][8] = 1
}

/**
 * يحوّل الرمز إلى SVG مضمَّن — لا صورة خارجية ولا `data:` في `img`,
 * فتطبعه المتصفحات بلا طلب شبكة.
 */
export function qrToSvgPath(code: QrCode): string {
  const parts: string[] = []
  for (let r = 0; r < code.size; r += 1) {
    for (let c = 0; c < code.size; c += 1) {
      if (code.modules[r][c]) parts.push(`M${c} ${r}h1v1h-1z`)
    }
  }
  return parts.join('')
}
