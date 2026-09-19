/**
 * Verificação de spec json-render com Jev (atoral: skill global json-render-jev).
 *
 * Uso:  npm run verify-spec -- "pedido do usuário"
 *
 * Delega para o script da skill em ~/.agents/skills/json-render-jev/verify-spec.mjs
 * (DeepSeek gera -> Jev verifica -> RENDER | ASK_USER | REGENERATE). A chave
 * da TypeSafe é lida do cofre do DSH; nada de segredo chega ao frontend.
 */
import { spawnSync } from 'node:child_process'

const skillScript = `${process.env.USERPROFILE}/.agents/skills/json-render-jev/verify-spec.mjs`
const prompt = process.argv.slice(2).join(' ').trim()

spawnSync(process.execPath, [skillScript, prompt], { stdio: 'inherit' })
process.exitCode = 0