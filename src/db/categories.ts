import type { SQLiteDatabase } from "expo-sqlite";

import type { Category } from "./types";

export async function listCategories(db: SQLiteDatabase): Promise<Category[]> {
    return db.getAllAsync<Category>(
        "SELECT id, name FROM categories ORDER BY name COLLATE NOCASE",
    );
}

export async function createCategory(
    db: SQLiteDatabase,
    name: string,
): Promise<number> {
    const trimmed = name.trim();
    await db.runAsync(
        "INSERT INTO categories (name, created_at) VALUES (?, ?) ON CONFLICT(name) DO NOTHING",
        trimmed,
        Date.now(),
    );
    const row = await db.getFirstAsync<{ id: number }>(
        "SELECT id FROM categories WHERE name = ?",
        trimmed,
    );
    if (!row) throw new Error(`category not found after insert: ${trimmed}`);
    return row.id;
}

export async function renameCategory(
    db: SQLiteDatabase,
    id: number,
    name: string,
) {
    await db.runAsync(
        "UPDATE categories SET name = ? WHERE id = ?",
        name.trim(),
        id,
    );
}

export async function removeCategory(db: SQLiteDatabase, id: number) {
    await db.runAsync("DELETE FROM categories WHERE id = ?", id);
}
