// Secret byte wrapper (P8-3a; docs/09 §16.8, §38).
//
// DEFENSE IN DEPTH ONLY. SecretBytes stops the common accidental leaks: JSON serialization,
// string conversion, template literals, Node's util.inspect / console formatting, object
// spreading and key enumeration all show a fixed redaction marker instead of the bytes. It does
// NOT protect against memory inspection, heap dumps, debuggers, a malicious caller or deliberate
// extraction through `reveal()`. JavaScript cannot guarantee that copies are wiped: `dispose()`
// zeroes this wrapper's own buffer only.

import { FairnessError } from "./version.ts";

/** The text every serialization path shows instead of secret bytes. */
export const REDACTED = "[redacted secret]";

/** Upper bound for wrapped secrets (seeds are 32 bytes; HMAC keys never need more). */
const MAX_SECRET_BYTES = 64;

const INSPECT = Symbol.for("nodejs.util.inspect.custom");

/** Module-private construction token: only fromBytes() can create a wrapper. */
const CONSTRUCT = Symbol("SecretBytes.construct");

export class SecretBytes {
  #bytes: Uint8Array | null;

  private constructor(token: symbol, bytes: Uint8Array) {
    if (token !== CONSTRUCT) {
      throw new FairnessError("invalid-bytes", "use SecretBytes.fromBytes");
    }
    this.#bytes = bytes;
    Object.freeze(this);
  }

  /** Wraps a COPY of `bytes`. The caller remains responsible for its own buffer. */
  static fromBytes(bytes: Uint8Array): SecretBytes {
    if (!(bytes instanceof Uint8Array)) {
      throw new FairnessError("invalid-bytes", "secret must be a Uint8Array");
    }
    if (bytes.length === 0 || bytes.length > MAX_SECRET_BYTES) {
      throw new FairnessError("invalid-length", "secret length is out of range");
    }
    return new SecretBytes(CONSTRUCT, Uint8Array.from(bytes));
  }

  /** Byte length (not secret). */
  get length(): number {
    return this.#live().length;
  }

  get disposed(): boolean {
    return this.#bytes === null;
  }

  /**
   * Returns a fresh copy the caller owns. Every use of this method is a deliberate disclosure
   * to the caller; keep the copy's lifetime short.
   */
  reveal(): Uint8Array {
    return Uint8Array.from(this.#live());
  }

  /** Constant-time comparison (for equal lengths); never short-circuits on content. */
  equals(other: SecretBytes): boolean {
    if (!(other instanceof SecretBytes)) return false;
    const a = this.#live();
    const b = other.#live();
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
  }

  /** Zeroes this wrapper's buffer; every later access throws `secret-disposed`. */
  dispose(): void {
    if (this.#bytes) this.#bytes.fill(0);
    this.#bytes = null;
  }

  toString(): string {
    return REDACTED;
  }

  toJSON(): string {
    return REDACTED;
  }

  [Symbol.toPrimitive](): string {
    return REDACTED;
  }

  [INSPECT](): string {
    return REDACTED;
  }

  #live(): Uint8Array {
    if (this.#bytes === null) {
      throw new FairnessError("secret-disposed", "secret was disposed");
    }
    return this.#bytes;
  }
}
