export type QuitKind = "electron" | "server";

export async function probeQuitRuntime(): Promise<QuitKind | null> {
  try {
    const res = await fetch("/__runtime", { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { canQuit?: boolean; kind?: string };
    if (!data?.canQuit) return null;
    return data.kind === "electron" ? "electron" : "server";
  } catch {
    return null;
  }
}

export async function requestShutdown(): Promise<void> {
  try {
    await fetch("/__shutdown", { method: "POST", cache: "no-store" });
  } catch {
    // Process is gone; that's the success path for the local server.
  }
}
