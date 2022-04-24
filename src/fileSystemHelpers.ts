import fs from 'fs/promises'
import path from 'path'

const isExists = async (path: string) => {
    try {
        await fs.access(path)
        return true
    } catch {
        return false
    }
}
export const writeFile = async (filePath: string, data: string) => {
    try {
        const dirname = path.dirname(filePath)
        const exist = await isExists(dirname)
        if (!exist) {
            await fs.mkdir(dirname, { recursive: true })
        }

        await fs.writeFile(filePath, data, 'utf8')
    } catch (err: any) {
        throw new Error(err)
    }
}
