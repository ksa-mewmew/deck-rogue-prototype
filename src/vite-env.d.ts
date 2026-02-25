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

// Vite 환경에서 import.meta.env 타입을 인식시키기 위한 선언 파일입니다.
// (VSCode/tsserver에서 `Property 'env' does not exist on type 'ImportMeta'` 오류 방지)
