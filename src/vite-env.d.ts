interface ImportMetaEnv {
	readonly BASE_URL: string
	readonly MODE: string
	readonly DEV: boolean
	readonly PROD: boolean
	readonly SSR: boolean
	readonly [key: string]: string | boolean | undefined
}

interface ImportMeta {
	readonly env: ImportMetaEnv
}

interface WindowEventMap {
	"deckrogue:layout": Event
}

declare module "*audio/music" {
	export type MusicMode = "explore" | "boss"
	export function installMusicUnlock(): void
	export function syncMusicFromGame(g: any): void
	export function getDesiredMusicMode(g: any): MusicMode
}
