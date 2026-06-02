import { beforeEach, describe, expect, it, vi } from "vitest";
import { persistedPreference } from "./persisted-preference";

// The factory is the only thing under test, so the Tauri FS plugin is mocked:
// we assert it calls the right primitives with the right args (file name,
// 2-space JSON, AppData dir) and honors the absent-file fallback — no real disk.
const fs = vi.hoisted(() => ({
  exists: vi.fn(),
  mkdir: vi.fn(),
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  BaseDirectory: { AppData: "AppData" },
  exists: fs.exists,
  mkdir: fs.mkdir,
  readTextFile: fs.readTextFile,
  writeTextFile: fs.writeTextFile,
}));

interface Pref {
  n: number;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("persistedPreference", () => {
  it("returns a fresh fallback when the file is absent, without reading", async () => {
    fs.exists.mockResolvedValue(false);
    const fallback = vi.fn(() => ({ n: 0 }));
    const { load } = persistedPreference<Pref>({
      file: "pref.json",
      fallback,
      parse: () => ({ n: -1 }),
    });

    const a = await load();
    const b = await load();

    expect(a).toEqual({ n: 0 });
    expect(fs.readTextFile).not.toHaveBeenCalled();
    // A factory, not a shared ref: each load hands back its own object.
    expect(a).not.toBe(b);
    expect(fallback).toHaveBeenCalledTimes(2);
  });

  it("parses the file contents when the file is present", async () => {
    fs.exists.mockResolvedValue(true);
    fs.readTextFile.mockResolvedValue('{"n":42}');
    const parse = vi.fn((json: string) => JSON.parse(json) as Pref);
    const { load } = persistedPreference<Pref>({
      file: "pref.json",
      fallback: () => ({ n: 0 }),
      parse,
    });

    const result = await load();

    expect(result).toEqual({ n: 42 });
    expect(fs.readTextFile).toHaveBeenCalledWith("pref.json", { baseDir: "AppData" });
    expect(parse).toHaveBeenCalledWith('{"n":42}');
  });

  it("saves pretty-printed JSON to the named AppData file, ensuring the dir first", async () => {
    fs.mkdir.mockResolvedValue(undefined);
    fs.writeTextFile.mockResolvedValue(undefined);
    const { save } = persistedPreference<Pref>({
      file: "pref.json",
      fallback: () => ({ n: 0 }),
      parse: () => ({ n: 0 }),
    });

    await save({ n: 7 });

    expect(fs.mkdir).toHaveBeenCalled();
    expect(fs.writeTextFile).toHaveBeenCalledWith("pref.json", JSON.stringify({ n: 7 }, null, 2), {
      baseDir: "AppData",
    });
  });
});
