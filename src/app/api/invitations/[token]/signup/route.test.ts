import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { hashInviteToken } from "@/lib/auth/invitations";

const rpc = vi.fn();
const createUser = vi.fn();

vi.mock("@/lib/ai/admin-client", () => ({
  supabaseAdmin: () => ({ rpc, auth: { admin: { createUser } } }),
}));

const { POST } = await import("./route");

let n = 0;
function call(token: string, body: unknown) {
  return POST(
    new Request("https://app.test/api/invitations/x/signup", {
      method: "POST",
      headers: { "x-forwarded-for": `10.0.0.${++n}` },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ token }) },
  );
}

beforeEach(() => {
  rpc.mockReset();
  createUser.mockReset();
});

describe("POST /api/invitations/[token]/signup — registro cerrado", () => {
  it("rechaza un token que no existe y no crea usuario", async () => {
    rpc.mockResolvedValue({ data: { ok: false, reason: "not_found" }, error: null });
    const res = await call("x", { email: "a@b.co", password: "123456" });
    expect(res.status).toBe(403);
    expect(createUser).not.toHaveBeenCalled();
  });

  it("rechaza invitaciones vencidas o usadas", async () => {
    for (const reason of ["expired", "used"]) {
      rpc.mockResolvedValue({ data: { ok: false, reason }, error: null });
      const res = await call("tok", { email: "a@b.co", password: "123456" });
      expect(res.status).toBe(403);
    }
    expect(createUser).not.toHaveBeenCalled();
  });

  it("un invitado con invitación pendiente se da de alta", async () => {
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
    createUser.mockResolvedValue({ data: {}, error: null });
    const res = await call("tok", {
      email: "inv@b.co",
      password: "123456",
      fullName: "Inv",
    });
    expect(res.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith("peek_invitation", {
      p_token_hash: hashInviteToken("tok"),
    });
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: "inv@b.co", email_confirm: true }),
    );
  });
});

describe("Auth cerrado en la fuente", () => {
  it("docker-compose desactiva el autorregistro de gotrue por defecto", () => {
    const compose = readFileSync(join(process.cwd(), "docker-compose.yml"), "utf8");
    expect(compose).toContain("GOTRUE_DISABLE_SIGNUP: ${GOTRUE_DISABLE_SIGNUP:-true}");
  });
});
