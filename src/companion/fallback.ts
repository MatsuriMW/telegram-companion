import type { Backend } from "./types";

// 主后端失败时用备用后端重试一次。这里只管「先试谁、再试谁」，不碰网络，方便单独测试。

export interface ModelReply {
    text: string;
    /** 实际回答的后端 */
    backend: Backend;
    /** 由备用后端回答时：主后端是谁、它为什么没回 */
    fellBack?: { from: Backend; why: string };
}

/** 主后端失败以后，这段时间里直接走备用，不让每条消息都先等它失败一遍。 */
export const PRIMARY_COOLDOWN_MS = 10 * 60e3;

const reason = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export class FallbackRunner {
    private down: { backend: Backend; until: number; why: string } | null = null;

    /** 换了后端或改了参数：忘掉「主后端刚失败过」。 */
    reset(): void {
        this.down = null;
    }

    async run(
        primary: Backend,
        fallback: Backend | null,
        call: (backend: Backend) => Promise<string>,
        now: number = Date.now(),
    ): Promise<ModelReply> {
        if (!fallback || fallback === primary) {
            return { text: await call(primary), backend: primary };
        }
        const down = this.down && this.down.backend === primary ? this.down : null;
        if (down && now < down.until) {
            // 主后端刚失败过：先走备用；备用也不行，再回头试一次主后端
            try {
                const text = await call(fallback);
                return { text, backend: fallback, fellBack: { from: primary, why: down.why } };
            } catch (e2) {
                try {
                    const text = await call(primary);
                    this.down = null;
                    return { text, backend: primary };
                } catch (e1) {
                    throw new Error(`${reason(e1)}；备用后端也没连上：${reason(e2)}`);
                }
            }
        }
        try {
            const text = await call(primary);
            this.down = null;
            return { text, backend: primary };
        } catch (e1) {
            const why = reason(e1);
            this.down = { backend: primary, until: now + PRIMARY_COOLDOWN_MS, why };
            try {
                const text = await call(fallback);
                return { text, backend: fallback, fellBack: { from: primary, why } };
            } catch (e2) {
                throw new Error(`${why}；备用后端也没连上：${reason(e2)}`);
            }
        }
    }
}
