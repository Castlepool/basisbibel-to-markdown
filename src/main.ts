// Run this script with: npm start
import { parseEpub } from '@gxl/epub-parser'
import * as path from 'path'
import { HTMLElement, parse } from 'node-html-parser'
import * as prettier from 'prettier'
import { writeFile } from './fileSystemHelpers'
import { biblicalBookTitleMapping, getBiblicalBookNumberByTitle, getIdFromBookPath, getNewBookTitleForOriginalBookId, getNewBookTitleForOriginalInlineTitle } from './biblicalBookTitleMapping'

parseEpub(path.normalize('input/BasisBibel.epub'), { type: 'path' }).then(async (epubBible) => {
    console.info(`Converting EPUB "${(epubBible.info?.title as any)._}" to markdown, please wait...`)

    const bookOverviewNotesPromises = biblicalBookTitleMapping.map(async (book) => {
        let bookNoteString = `# ${book.newTitle}`
        bookNoteString += `\n\n[[${book.newTitle} 1|Lesen →]]`
        bookNoteString += '\n\n---\nlinks: [[BasisBibel - Inhalt]]'
        bookNoteString = prettier.format(bookNoteString, { parser: 'markdown' })
        const bookNumberedFolderName = `${String(getBiblicalBookNumberByTitle(book.newTitle)).padStart(2, '0')} - ${book.newTitle}`
        await writeFile(`BasisBibel/Bibel/${bookNumberedFolderName}/Buch ${book.newTitle}.md`, bookNoteString)
    })
    
    let basisBibelTableOfContentString = '# Basisbibel - Inhalt\n'
    biblicalBookTitleMapping.forEach((book) => {
            basisBibelTableOfContentString += `\n- [[Buch ${book.newTitle}]]`
        })
    await writeFile(`BasisBibel/BasisBibel - Inhalt.md`, basisBibelTableOfContentString)

    const allBibleSectionsInEpub = epubBible.sections?.slice(5, 348).map((section) => parse(section.htmlString))
    const allBibleCommentsInEpub = epubBible.sections?.slice(356, 699).map((section) => parse(section.htmlString))

    if (!allBibleSectionsInEpub || !allBibleCommentsInEpub || !epubBible.structure) {
        throw Error("Epub doesn't contain expected data!")
    }

    const sectionPromises = allBibleSectionsInEpub.map(async (section, sectionIndex) => {
        // Note: Sections can contain multiple chapters of a biblical book!
        const chaptersHtml = getChapterHtmlElements(section)
        const chaptersPromises = chaptersHtml.map(async (chapterHtml, index) => {
            // Find out which book the current chapter belongs to
            const originalBookInlineTitle = getOriginalBookInlineTitleForChapter(chapterHtml)
            if (!originalBookInlineTitle) throw Error('Missing book title')

            const bookTitle = getNewBookTitleForOriginalInlineTitle(originalBookInlineTitle)

            // For some chapters, like "Judas", there is no chapter number, because it has only one chapter
            const chapterNumberString = chapterHtml.querySelector('div.bcn')?.text.match(/\d+$/)?.[0]
            const chapterNumber = chapterNumberString ? Number.parseInt(chapterNumberString) : 1
            const chapterTitle = `${bookTitle} ${chapterNumber}`

            const nextChapterHtml: HTMLElement | undefined = chaptersHtml[index + 1] ?? (allBibleSectionsInEpub[sectionIndex + 1] && getChapterHtmlElements(allBibleSectionsInEpub[sectionIndex + 1])[0])
            const bookTitleOfNextChapter: string | undefined = nextChapterHtml && getNewBookTitleForOriginalInlineTitle(getOriginalBookInlineTitleForChapter(nextChapterHtml))

            let chapterString = `# ${chapterTitle}\n\n`

            if (chapterNumber > 1) {
                chapterString += `[[${bookTitle} ${chapterNumber - 1}]] | `
            }
            chapterString += `[[Buch ${bookTitle}]]`
            if (bookTitle === bookTitleOfNextChapter) {
                chapterString += ` | [[${bookTitle} ${chapterNumber + 1}]]`
            }
            chapterString += '\n\n---'

            const versesAndMultiChapterHeadingsAndSubChapterHeadings = chapterHtml.querySelectorAll('h2, p')

            versesAndMultiChapterHeadingsAndSubChapterHeadings.forEach((chapterItem) => {
                if (chapterItem.classList.contains('ms2')) {
                    // large heading that can cover multiple chapters
                    chapterString += `\n\n## ${chapterItem.childNodes[0].text.trim()}`
                } else if (chapterItem.classList.contains('mr')) {
                    // verses that belong to large heading, e.g. "Matthäus 1,1-2,23"
                    const verseRange = chapterItem.childNodes[0].text.match(/ ([0-9,-—]*)$/)?.[1]
                    if (!verseRange) throw Error(`Could not extract verse range from ${chapterItem.childNodes[0].text}`)
                    chapterString += ` (${verseRange})\n`
                } else if (chapterItem.classList.contains('s1')) {
                    // small heading that can cover multiple verses (and sometimes reach a bit into the next chapter)
                    chapterString += `\n\n\n### ${chapterItem.childNodes[0].text.trim()}\n`
                } else if (chapterItem.classList.contains('r')) {
                    // parallel passages, e.g. "Markus 1,2-6; Lukas 3,1-6"
                    const parallelPassagesHtmlLinks = chapterItem.querySelectorAll('a')
                    const markdownLinksToParallelPassages = parallelPassagesHtmlLinks.map(toPassageMarkdownLink)
                    chapterString += `\n→ ${markdownLinksToParallelPassages.join('; ')}\n`
                } else if (chapterItem.tagName.toLowerCase() === 'p') {
                    // processing bible verses, which can have some tags used in between
                    chapterItem.childNodes.forEach((verseHtmlElement) => {
                        const text = verseHtmlElement.text
                        if (verseHtmlElement instanceof HTMLElement) {
                            // not just a TextNode but an html element nested inside the verse text
                            const verseNumber = verseHtmlElement.querySelector('a[href^="#cref"]')?.text

                            if (verseNumber) {
                                chapterString += `\n\n###### ${verseNumber}\n`
                            } else if (verseHtmlElement.classList.contains('k')) {
                                // in the epub, this text links to a side note, but I don't need that for my use-case - I want to build links by myself during my studies
                                // a few links start with '*', which I don't want in the output
                                chapterString += text.replace(/^\s?\*/, '')
                            } else if (verseHtmlElement.classList.contains('nd')) {
                                // the text in here is uppercase, we can just use it as is
                                chapterString += text
                            } else if (verseHtmlElement.classList.contains('it')) {
                                // the text in here is italic
                                chapterString += `_${text}_`
                            }
                        } else {
                            // just normal text of the verse, not wrapped in any sub-tag
                            // a few verses start with '*', which hints to a verse range side note - I don't want this in the output
                            chapterString += text.replace(/^\s?\*/, '')
                        }
                    })
                }
            })

            chapterString = prettier.format(chapterString, { parser: 'markdown' })
            const bookNumberedFolderName = `${String(getBiblicalBookNumberByTitle(bookTitle)).padStart(2, '0')} - ${bookTitle}`
            await writeFile(`BasisBibel/Bibel/${bookNumberedFolderName}/${chapterTitle}.md`, chapterString)
        })
        await Promise.all(chaptersPromises)
    })

    // One comment section can contain comments for multiple chapters
    // ALL comments of one chapter are in the same section
    const commentSectionPromises = allBibleCommentsInEpub.map(async (section) => {
        const commentsHtml = section.querySelectorAll('.efb')

        const commentPromises = commentsHtml.map(async (commentHtml) => {
            const bookId = commentHtml.id.match(/fn-(.+)-/)?.[1]
            if (!bookId) throw `Couldn't extract book id from ${commentHtml.id}`
            const bookTitle = getNewBookTitleForOriginalBookId(bookId)
            const commentVerseLink = commentHtml.querySelector('.re')?.text.trim() // e.g. "← 1,16"
            if (!commentVerseLink) throw `Couldn't find a comment verse link!`
            const chapterNumber = commentVerseLink.match(/← ([0-9]+)/)?.[1]
            const verseNumber = commentVerseLink.match(/← [0-9]+,([0-9]+)/)?.[1]
            const commentMarkdownVerseLink = `[[${bookTitle} ${chapterNumber}${verseNumber ? `#${verseNumber}` : ''}|${commentVerseLink}]]`

            const commentTitle = commentHtml.querySelector('.fq')?.text.trim().replace(/:$/, '')
            const commentText = commentHtml
                .querySelector('.ft')
                ?.childNodes.map((descriptionTextOrHtmlElement) => {
                    if (descriptionTextOrHtmlElement instanceof HTMLElement && descriptionTextOrHtmlElement.classList.contains('xt')) {
                        const parallelPassagesHtmlLinks = descriptionTextOrHtmlElement.querySelectorAll('a')
                        const markdownLinksToParallelPassages = parallelPassagesHtmlLinks.map(toPassageMarkdownLink)
                        return `${markdownLinksToParallelPassages.join('; ')}`
                    } else {
                        return descriptionTextOrHtmlElement.text
                    }
                })
                .join('')
                .replace(/ /g, '')

            const bookNumberedFolderName = `${String(getBiblicalBookNumberByTitle(bookTitle)).padStart(2, '0')} - ${bookTitle}`
            const chapterTitle = `${bookTitle} ${chapterNumber}`
            const commentTargetFilePath = `BasisBibel/Randbemerkungen/${bookNumberedFolderName}/${chapterTitle} - Randbemerkungen.md`
            const commentFullText = `## ${commentTitle} (${commentMarkdownVerseLink})\n\n${commentText}`
            const commentFormattedText = prettier.format(commentFullText, { parser: 'markdown' })
            return {
                targetFilePath: commentTargetFilePath,
                chapterTitle: chapterTitle,
                commentText: commentFormattedText,
            }
        })
        const comments = await Promise.all(commentPromises)

        // Extract unique chapter titles from comments and create file with comments for each chapter
        return [...new Map(comments.map((comment) => [comment.chapterTitle, comment])).values()].map(async (chapterCommentInfo) => {
            let commentsFullText = `# ${chapterCommentInfo.chapterTitle} - Randbemerkungen\n\n`
            commentsFullText += comments
                .filter((comment) => comment.targetFilePath === chapterCommentInfo.targetFilePath)
                .map((comment) => comment.commentText)
                .join('\n')
            await writeFile(chapterCommentInfo.targetFilePath, commentsFullText)
        })
    })

    await Promise.all([...bookOverviewNotesPromises, ...sectionPromises, ...commentSectionPromises])

    console.info('Finished processing. See "BasisBibel" folder for the results :)')
})

const getChapterHtmlElements = (section: HTMLElement) => section.querySelectorAll('.bc')

const getOriginalBookInlineTitleForChapter = (section: HTMLElement) => {
    const titleSection = section.querySelector('span.cb')
    if (!titleSection) {
        throw Error(`Couldn't find chapter title in html element ${JSON.stringify(section)}`)
    }
    return titleSection.textContent
}

const toPassageMarkdownLink = (parallelPassageHtmlLink: HTMLElement) => {
    const referenceToParallelPassage = parallelPassageHtmlLink.getAttribute('href') // e.g. mrk_1.xhtml#vref-1-2
    if (!referenceToParallelPassage) throw Error(`Missing href attribute on link to parallel passage!`)

    const referencedChapterNumber = referenceToParallelPassage.match(/vref-([0-9]+)-/)?.[1] ?? referenceToParallelPassage.match(/cref-([0-9]+)$/)?.[1]
    const referencedStartingVerse = referenceToParallelPassage.match(/vref-[0-9]+-([0-9]+)$/)?.[1]
    const titleOfReferencedBook = getNewBookTitleForOriginalBookId(getIdFromBookPath(referenceToParallelPassage.split('#')[0]))

    if (referencedStartingVerse) {
        const linkVerseRangeString = parallelPassageHtmlLink.text.trim().split(',')[1] ?? parallelPassageHtmlLink.text.trim().split(' ')[1]
        return `[[${titleOfReferencedBook} ${referencedChapterNumber}#${referencedStartingVerse}|${titleOfReferencedBook} ${referencedChapterNumber},${linkVerseRangeString}]]`
    } else {
        return `[[${titleOfReferencedBook} ${referencedChapterNumber}]]`
    }
}
