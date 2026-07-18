/**
 * Codec for Factorio mod-settings.dat (property tree).
 * Port of factorio_data_codec.py (whitequark/factorio-data-codec, 0-clause BSD).
 */

enum PropertyTreeType {
  Null = 0,
  Bool = 1,
  Number = 2,
  String = 3,
  List = 4,
  Dictionary = 5,
  SignedInt = 6,
  UnsignedInt = 7,
}

class ImmutableString {
  constructor(readonly value: Buffer | null) {}

  static load(buf: Buffer, offset: { o: number }): ImmutableString {
    const isNone = buf.readUInt8(offset.o);
    offset.o += 1;
    if (isNone) return new ImmutableString(null);
    let len = buf.readUInt8(offset.o);
    offset.o += 1;
    if (len === 0xff) {
      len = buf.readUInt32LE(offset.o);
      offset.o += 4;
    }
    const value = buf.subarray(offset.o, offset.o + len);
    offset.o += len;
    return new ImmutableString(Buffer.from(value));
  }

  save(chunks: Buffer[]): void {
    chunks.push(Buffer.from([this.value ? 0 : 1]));
    if (!this.value) return;
    if (this.value.length >= 0xff) {
      const hdr = Buffer.alloc(5);
      hdr.writeUInt8(0xff, 0);
      hdr.writeUInt32LE(this.value.length, 1);
      chunks.push(hdr, this.value);
    } else {
      chunks.push(Buffer.from([this.value.length]), this.value);
    }
  }
}

export class PropertyTree {
  key: ImmutableString;
  value: PropertyTree[] | boolean | number | ImmutableString | null;
  type: PropertyTreeType;
  anyType: boolean;

  constructor(
    key: ImmutableString | null,
    value: PropertyTree[] | boolean | number | ImmutableString | null,
    type: PropertyTreeType,
    anyType = false,
  ) {
    this.key = key ?? new ImmutableString(null);
    this.value = value;
    this.type = type;
    this.anyType = anyType;
  }

  static load(buf: Buffer, offset: { o: number }): PropertyTree {
    const valueType = buf.readUInt8(offset.o);
    const anyType = !!buf.readUInt8(offset.o + 1);
    offset.o += 2;

    let value: PropertyTree[] | boolean | number | ImmutableString | null =
      null;
    if (valueType === PropertyTreeType.Null) {
      value = null;
    } else if (valueType === PropertyTreeType.Bool) {
      value = !!buf.readUInt8(offset.o);
      offset.o += 1;
    } else if (valueType === PropertyTreeType.Number) {
      value = buf.readDoubleLE(offset.o);
      offset.o += 8;
    } else if (valueType === PropertyTreeType.SignedInt) {
      value = Number(buf.readBigInt64LE(offset.o));
      offset.o += 8;
    } else if (valueType === PropertyTreeType.UnsignedInt) {
      value = Number(buf.readBigUInt64LE(offset.o));
      offset.o += 8;
    } else if (valueType === PropertyTreeType.String) {
      value = ImmutableString.load(buf, offset);
    } else if (
      valueType === PropertyTreeType.List ||
      valueType === PropertyTreeType.Dictionary
    ) {
      const count = buf.readUInt32LE(offset.o);
      offset.o += 4;
      const items: PropertyTree[] = [];
      for (let i = 0; i < count; i += 1) {
        const key = ImmutableString.load(buf, offset);
        const item = PropertyTree.load(buf, offset);
        item.key = key;
        items.push(item);
      }
      value = items;
    }

    return new PropertyTree(null, value, valueType, anyType);
  }

  save(chunks: Buffer[]): void {
    chunks.push(Buffer.from([this.type, this.anyType ? 1 : 0]));
    if (this.type === PropertyTreeType.Null) return;
    if (this.type === PropertyTreeType.Bool) {
      chunks.push(Buffer.from([this.value ? 1 : 0]));
      return;
    }
    if (this.type === PropertyTreeType.Number) {
      const b = Buffer.alloc(8);
      b.writeDoubleLE(this.value as number, 0);
      chunks.push(b);
      return;
    }
    if (this.type === PropertyTreeType.SignedInt) {
      const b = Buffer.alloc(8);
      b.writeBigInt64LE(BigInt(this.value as number), 0);
      chunks.push(b);
      return;
    }
    if (this.type === PropertyTreeType.UnsignedInt) {
      const b = Buffer.alloc(8);
      b.writeBigUInt64LE(BigInt(this.value as number), 0);
      chunks.push(b);
      return;
    }
    if (this.type === PropertyTreeType.String) {
      (this.value as ImmutableString).save(chunks);
      return;
    }
    if (
      this.type === PropertyTreeType.List ||
      this.type === PropertyTreeType.Dictionary
    ) {
      const items = this.value as PropertyTree[];
      const hdr = Buffer.alloc(4);
      hdr.writeUInt32LE(items.length, 0);
      chunks.push(hdr);
      for (const item of items) {
        item.key.save(chunks);
        item.save(chunks);
      }
    }
  }
}

export class ModSettings {
  constructor(
    readonly data: PropertyTree,
    readonly version: [number, number, number, number],
    readonly hasQuality: boolean,
  ) {}

  static load(input: Buffer): ModSettings {
    const offset = { o: 0 };
    const version: [number, number, number, number] = [
      input.readUInt16LE(offset.o),
      input.readUInt16LE(offset.o + 2),
      input.readUInt16LE(offset.o + 4),
      input.readUInt16LE(offset.o + 6),
    ];
    offset.o += 8;
    const hasQuality = !!input.readUInt8(offset.o);
    offset.o += 1;
    if (version[0] < 0 || (version[0] === 0 && version[1] < 18)) {
      throw new Error(
        `Cannot load settings from Factorio ${version.join('.')}: settings version too low`,
      );
    }
    const data = PropertyTree.load(input, offset);
    return new ModSettings(data, version, hasQuality);
  }

  save(): Buffer {
    const chunks: Buffer[] = [];
    const ver = Buffer.alloc(8);
    ver.writeUInt16LE(this.version[0], 0);
    ver.writeUInt16LE(this.version[1], 2);
    ver.writeUInt16LE(this.version[2], 4);
    ver.writeUInt16LE(this.version[3], 6);
    chunks.push(ver, Buffer.from([this.hasQuality ? 1 : 0]));
    this.data.save(chunks);
    return Buffer.concat(chunks);
  }
}

function encodePropertyTree(node: PropertyTree): unknown {
  switch (node.type) {
    case PropertyTreeType.Null:
      return null;
    case PropertyTreeType.Bool:
      return node.value;
    case PropertyTreeType.Number:
    case PropertyTreeType.SignedInt:
      return node.value;
    case PropertyTreeType.UnsignedInt:
      return { '!pt': 'uint64', v: node.value };
    case PropertyTreeType.String:
      return (node.value as ImmutableString).value?.toString('utf-8') ?? null;
    case PropertyTreeType.List:
      return (node.value as PropertyTree[]).map((item) =>
        encodePropertyTree(item),
      );
    case PropertyTreeType.Dictionary: {
      const out: Record<string, unknown> = {};
      for (const item of node.value as PropertyTree[]) {
        const key = item.key.value?.toString('utf-8') ?? '';
        out[key] = encodePropertyTree(item);
      }
      return out;
    }
    default:
      return null;
  }
}

export function modSettingsToJsonObject(
  ms: ModSettings,
): Record<string, unknown> {
  return {
    '!type': 'ModSettings',
    version: ms.version,
    has_quality: ms.hasQuality,
    data: encodePropertyTree(ms.data),
  };
}

export function modSettingsToJsonText(ms: ModSettings, indent = 2): string {
  return JSON.stringify(modSettingsToJsonObject(ms), null, indent);
}

export function parseGameVersionTuple(
  version: string,
): [number, number, number, number] {
  const parts = String(version || '')
    .trim()
    .split('.')
    .map((x) => {
      const n = parseInt(x, 10);
      return Number.isFinite(n) ? n : 0;
    });
  while (parts.length < 4) parts.push(0);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 0];
}

export function buildDefaultModSettingsJson(
  version = '',
  hasQuality = false,
): Record<string, unknown> {
  return {
    '!type': 'ModSettings',
    version: parseGameVersionTuple(version),
    has_quality: !!hasQuality,
    data: {
      startup: {},
      'runtime-global': {},
      'runtime-per-user': {},
    },
  };
}

function decodeJsonValue(raw: unknown): PropertyTree {
  if (raw === null) return new PropertyTree(null, null, PropertyTreeType.Null);
  if (typeof raw === 'boolean')
    return new PropertyTree(null, raw, PropertyTreeType.Bool);
  if (typeof raw === 'number') {
    if (Number.isInteger(raw))
      return new PropertyTree(null, raw, PropertyTreeType.SignedInt);
    return new PropertyTree(null, raw, PropertyTreeType.Number);
  }
  if (typeof raw === 'string')
    return new PropertyTree(
      null,
      new ImmutableString(Buffer.from(raw, 'utf-8')),
      PropertyTreeType.String,
    );
  if (Array.isArray(raw)) {
    const items = raw.map((v) => decodeJsonValue(v));
    return new PropertyTree(null, items, PropertyTreeType.List);
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (obj['!pt'] === 'uint64' && 'v' in obj) {
      return new PropertyTree(
        null,
        Number(obj.v),
        PropertyTreeType.UnsignedInt,
      );
    }
    const items: PropertyTree[] = [];
    for (const [key, value] of Object.entries(obj)) {
      const item = decodeJsonValue(value);
      item.key = new ImmutableString(Buffer.from(key, 'utf-8'));
      items.push(item);
    }
    return new PropertyTree(null, items, PropertyTreeType.Dictionary);
  }
  throw new Error(`Cannot convert JSON value: ${String(raw)}`);
}

export function modSettingsFromJson(raw: unknown): ModSettings {
  let parsed = raw;
  if (typeof raw === 'string') parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('expected_mod_settings_root');
  }
  const obj = parsed as Record<string, unknown>;
  if (obj['!type'] !== 'ModSettings')
    throw new Error('expected_mod_settings_root');
  const data = decodeJsonValue(obj.data);
  const ver = obj.version;
  if (!Array.isArray(ver) || ver.length !== 4)
    throw new Error('invalid ModSettings version');
  return new ModSettings(
    data,
    [Number(ver[0]), Number(ver[1]), Number(ver[2]), Number(ver[3])],
    !!obj.has_quality,
  );
}

export function isValidModSettingsDat(path: string): boolean {
  try {
    const { readFileSync } = require('fs') as typeof import('fs');
    ModSettings.load(readFileSync(path));
    return true;
  } catch {
    return false;
  }
}

export function isValidModSettingsBuffer(buf: Buffer): boolean {
  try {
    ModSettings.load(buf);
    return true;
  } catch {
    return false;
  }
}
