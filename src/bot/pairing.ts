/**
 * Pairing: while the allowlist is empty, whoever sends the bot the code shown in
 * the settings tab becomes its owner. The code only lives in memory, and a few
 * wrong guesses lock it so it cannot be found by trying every number.
 */
export type PairResult = "paired" | "wrong" | "locked" | "no-code" | "no-digits";

/** Wrong guesses one Telegram account may make before it is ignored. */
export const WRONG_PER_USER = 5;
/** Wrong guesses from everyone together before the code stops working until it is renewed. */
export const WRONG_TOTAL = 20;

export class Pairing {
    code: string | null = null;
    private wrongBy = new Map<number, number>();
    private wrongTotal = 0;

    /** Make a new six-digit code and forget earlier wrong guesses. */
    renew(): string {
        const n = new Uint32Array(1);
        crypto.getRandomValues(n);
        this.code = String(n[0] % 1_000_000).padStart(6, "0");
        this.wrongBy.clear();
        this.wrongTotal = 0;
        return this.code;
    }

    /** Too many wrong guesses: the code no longer works until renew(). */
    get locked(): boolean {
        return this.wrongTotal >= WRONG_TOTAL;
    }

    /** The digits in a message, so "123 456" and "/start 123456" both count. */
    static digitsOf(text: string): string {
        return text.replace(/\D/g, "");
    }

    attempt(userId: number, text: string): PairResult {
        if (!this.code) return "no-code";
        if (this.locked || (this.wrongBy.get(userId) ?? 0) >= WRONG_PER_USER) return "locked";
        const digits = Pairing.digitsOf(text);
        // Tapping Start or saying hello is not a guess.
        if (!digits) return "no-digits";
        if (digits === this.code) {
            this.code = null;
            return "paired";
        }
        this.wrongBy.set(userId, (this.wrongBy.get(userId) ?? 0) + 1);
        this.wrongTotal++;
        return "wrong";
    }
}
