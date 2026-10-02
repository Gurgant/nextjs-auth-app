/**
 * @jest-environment node
 *
 * UserRepository password writes, on a fake Prisma delegate (no database).
 */
import bcrypt from "bcryptjs";
import type { PrismaClient } from "@/generated/prisma";
import { UserRepository } from "../user.repository";

interface UpdateArgs {
  where: { id: string };
  data: Record<string, unknown>;
}

describe("UserRepository password writes", () => {
  const previousRounds = process.env.BCRYPT_ROUNDS;
  const mockUpdate = jest.fn(async ({ where, data }: UpdateArgs) => ({
    id: where.id,
    ...data,
  }));
  let repo: UserRepository;

  beforeEach(() => {
    // 5 differs from the old literal (12) and from the Jest default (4).
    process.env.BCRYPT_ROUNDS = "5";
    mockUpdate.mockClear();
    repo = new UserRepository({
      user: { update: mockUpdate },
    } as unknown as PrismaClient);
  });

  afterEach(() => {
    if (previousRounds === undefined) {
      delete process.env.BCRYPT_ROUNDS;
    } else {
      process.env.BCRYPT_ROUNDS = previousRounds;
    }
  });

  it("update() hashes a plain-text password at the configured cost (PW-6)", async () => {
    await repo.update("u1", { password: "Plain123!" });

    const stored = mockUpdate.mock.calls[0][0].data.password as string;
    expect(stored).not.toBe("Plain123!");
    expect(await bcrypt.compare("Plain123!", stored)).toBe(true);
    expect(bcrypt.getRounds(stored)).toBe(5);
  });

  it("update() without a password passes the data through unchanged", async () => {
    await repo.update("u1", { name: "N" });

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { name: "N" },
    });
  });

  it("updatePassword() stores the given hash as it is", async () => {
    const hash = await bcrypt.hash("Plain123!", 4);

    await repo.updatePassword("u1", hash);

    expect(mockUpdate.mock.calls[0][0].data.password).toBe(hash);
  });

  it("updatePassword() leaves the session version alone unless asked", async () => {
    await repo.updatePassword("u1", "hash");

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { password: "hash" },
    });
  });

  it("updatePassword() with revokeSessions bumps the session version in the same update", async () => {
    await repo.updatePassword("u1", "hash", { revokeSessions: true });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { password: "hash", sessionVersion: { increment: 1 } },
    });
  });
});
