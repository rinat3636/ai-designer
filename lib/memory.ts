import { prisma } from "@/lib/prisma";

export type LikedImage = {
  url: string;
  generationId?: string;
  imageId?: string;
  templateSlug?: string;
  conceptName?: string;
  style?: string;
  palette?: string[];
  instruction?: string;
  reason?: string;
  at: string;
};

export type DislikeEntry = {
  pattern: string;
  reason?: string;
  at: string;
};

export type EditMemoryEntry = {
  instruction: string;
  outcome: "success" | "revert" | "favorite" | "scaled";
  generationId?: string;
  imageUrl?: string;
  responseToUser?: string;
  at: string;
};

export type ProjectMemoryNotes = {
  likes?: LikedImage[];
  dislikes?: DislikeEntry[];
  editHistory?: EditMemoryEntry[];
  learnedRules?: string[];
  preferredPalette?: string[];
  avoidedElements?: string[];
  summary?: string;
};

export type MemorySnapshot = {
  niche?: string | null;
  companyName?: string | null;
  style?: string | null;
  palette: string[];
  contacts?: Record<string, string>;
  summary?: string;
  likes: string[];
  dislikes: string[];
  recentEdits: string[];
  learnedRules: string[];
  preferredPalette: string[];
  avoidedElements: string[];
};

const MAX_LIKES = 10;
const MAX_DISLIKES = 10;
const MAX_EDIT_HISTORY = 15;

function emptyNotes(): ProjectMemoryNotes {
  return {
    likes: [],
    dislikes: [],
    editHistory: [],
    learnedRules: [],
    preferredPalette: [],
    avoidedElements: [],
    summary: "",
  };
}

function readNotes(notes: unknown): ProjectMemoryNotes {
  if (!notes || typeof notes !== "object") return emptyNotes();
  const n = notes as ProjectMemoryNotes;
  return {
    likes: Array.isArray(n.likes) ? n.likes : [],
    dislikes: Array.isArray(n.dislikes) ? n.dislikes : [],
    editHistory: Array.isArray(n.editHistory) ? n.editHistory : [],
    learnedRules: Array.isArray(n.learnedRules) ? n.learnedRules : [],
    preferredPalette: Array.isArray(n.preferredPalette) ? n.preferredPalette : [],
    avoidedElements: Array.isArray(n.avoidedElements) ? n.avoidedElements : [],
    summary: typeof n.summary === "string" ? n.summary : "",
  };
}

export async function getProjectMemory(userId: string) {
  let memory = await prisma.projectMemory.findUnique({ where: { userId } });
  if (!memory) {
    memory = await prisma.projectMemory.create({
      data: { userId, notes: emptyNotes() as any },
    });
  }
  return { ...memory, notes: readNotes(memory.notes) };
}

async function updateNotes(userId: string, updater: (notes: ProjectMemoryNotes) => ProjectMemoryNotes) {
  const memory = await getProjectMemory(userId);
  const notes = updater(memory.notes);
  await prisma.projectMemory.update({
    where: { userId },
    data: {
      notes: notes as any,
      ...(notes.preferredPalette?.length ? { palette: notes.preferredPalette as any } : {}),
      ...(notes.summary ? {} : {}),
    },
  });
  return notes;
}

export async function recordLike(
  userId: string,
  payload: Omit<LikedImage, "at">
) {
  return updateNotes(userId, (notes) => {
    const likes = notes.likes || [];
    const entry: LikedImage = { ...payload, at: new Date().toISOString() };
    const filtered = likes.filter((l) => l.url !== payload.url || l.instruction !== payload.instruction);
    const next = [entry, ...filtered].slice(0, MAX_LIKES);
    const likedPalette = Array.isArray(payload.palette) ? payload.palette : [];
    const preferredPalette = notes.preferredPalette || [];
    const mergedPalette = [...new Set([...likedPalette, ...preferredPalette])].slice(0, 8);
    const learnedRules = notes.learnedRules || [];
    if (payload.style && !learnedRules.some((r) => r.toLowerCase().includes(payload.style!.toLowerCase()))) {
      learnedRules.push(`Пользователю нравится стиль: ${payload.style}`);
    }
    if (likedPalette.length && !learnedRules.some((r) => r.toLowerCase().includes("палитра"))) {
      learnedRules.push(`Пользователю нравится палитра: ${likedPalette.join(", ")}`);
    }
    return {
      ...notes,
      likes: next,
      preferredPalette: mergedPalette,
      learnedRules: learnedRules.slice(0, 10),
    };
  });
}

export async function recordDislike(userId: string, pattern: string, reason?: string) {
  return updateNotes(userId, (notes) => {
    const dislikes = notes.dislikes || [];
    const entry: DislikeEntry = { pattern, reason, at: new Date().toISOString() };
    const next = [entry, ...dislikes].filter((d, i, arr) => arr.findIndex((x) => x.pattern === d.pattern) === i).slice(0, MAX_DISLIKES);
    const learnedRules = notes.learnedRules || [];
    const rule = `Избегать: ${reason || pattern}`;
    if (!learnedRules.some((r) => r.toLowerCase().includes((reason || pattern).toLowerCase()))) {
      learnedRules.push(rule);
    }
    return { ...notes, dislikes: next, learnedRules: learnedRules.slice(0, 10) };
  });
}

export async function recordEditOutcome(
  userId: string,
  payload: Omit<EditMemoryEntry, "at">
) {
  return updateNotes(userId, (notes) => {
    const editHistory = notes.editHistory || [];
    const entry: EditMemoryEntry = { ...payload, at: new Date().toISOString() };
    const next = [entry, ...editHistory].slice(0, MAX_EDIT_HISTORY);
    const learnedRules = notes.learnedRules || [];
    // Summarize revert as a high-level style preference, not the raw old text.
    if (payload.outcome === "revert" && payload.instruction) {
      const short = payload.instruction.slice(0, 60);
      const rule = `Пользователь отменил подобное изменение: ${short}`;
      if (!learnedRules.some((r) => r.toLowerCase().includes(short.toLowerCase()))) {
        learnedRules.push(rule);
      }
    }
    return {
      ...notes,
      editHistory: next,
      learnedRules: learnedRules.slice(0, 10),
    };
  });
}

export function buildMemorySnapshot(userId: string): Promise<MemorySnapshot> {
  return getProjectMemory(userId).then((memory) => {
    const notes = memory.notes;
    const contacts: Record<string, string> = {};
    const c = memory.contacts as Record<string, string> | undefined;
    if (c) {
      for (const [k, v] of Object.entries(c)) {
        if (v) contacts[k] = v;
      }
    }
    const palette = (memory.palette as string[] | undefined) || [];
    return {
      niche: memory.niche,
      companyName: memory.companyName,
      style: memory.style,
      palette,
      contacts,
      summary: notes.summary || "",
      likes: [],
      dislikes: [],
      recentEdits: [],
      learnedRules: (notes.learnedRules || []).slice(0, 8),
      preferredPalette: (notes.preferredPalette || []).slice(0, 6),
      avoidedElements: [],
    };
  });
}

export function memoryToPromptText(snapshot: MemorySnapshot): string {
  const parts: string[] = [];
  if (snapshot.summary) parts.push(`Summary of user preferences: ${snapshot.summary}`);
  if (snapshot.companyName) parts.push(`Company: ${snapshot.companyName}`);
  if (snapshot.niche) parts.push(`Business/niche: ${snapshot.niche}`);
  if (snapshot.style) parts.push(`Preferred style: ${snapshot.style}`);
  if (snapshot.palette.length || snapshot.preferredPalette.length) {
    parts.push(`Known palette: ${[...new Set([...snapshot.palette, ...snapshot.preferredPalette])].join(", ")}`);
  }
  if (Object.keys(snapshot.contacts || {}).length) {
    parts.push(`Known contacts: ${JSON.stringify(snapshot.contacts)}`);
  }
  if (snapshot.learnedRules.length) parts.push(`Rules learned from feedback: ${snapshot.learnedRules.join("; ")}`);
  return parts.length ? parts.join("\n") : "No prior memory.";
}

export async function rememberGenerationFacts(
  userId: string,
  brief: { businessDesc?: string; companyName?: string; style?: string; colors?: string[]; website?: string },
  data: Record<string, string>,
  conceptName?: string,
  referenceImages?: string[]
) {
  await prisma.projectMemory.upsert({
    where: { userId },
    update: {
      niche: brief.businessDesc || undefined,
      companyName: brief.companyName || undefined,
      style: brief.style || conceptName || undefined,
      palette: (brief.colors || []) as any,
      contacts: {
        phone: data.phone || undefined,
        website: data.website || brief.website || undefined,
        address: data.address || undefined,
        email: data.email || undefined,
        telegram: data.telegram || undefined,
      } as any,
      files: (referenceImages || []) as any,
    },
    create: {
      userId,
      niche: brief.businessDesc,
      companyName: brief.companyName,
      style: brief.style || conceptName,
      palette: (brief.colors || []) as any,
      contacts: {
        phone: data.phone || undefined,
        website: data.website || brief.website || undefined,
        address: data.address || undefined,
        email: data.email || undefined,
        telegram: data.telegram || undefined,
      } as any,
      files: (referenceImages || []) as any,
      notes: emptyNotes() as any,
    },
  });
}
