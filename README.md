# Convert BasisBibel EPUB to markdown

Converts EPUB version of german bible translation 'BasisBibel - Die Kompakte' to markdown.

The produced files are linked via wiki-links. This way, you can use your bible e.g. in an Obsidian vault (the idea comes from an [Obsidian forum post](https://forum.obsidian.md/t/bible-study-in-obsidian-kit-including-the-bible-in-markdown)).

## How to

Prerequisite: You must have node.js (and npm) installed.

1. Buy 'BasisBibel - Die Kompakte' in EPUB version
2. Create a folder called 'input' here, copy the epub file into it and rename it to 'BasisBibel.epub'
3. Run `npm install`
4. Run `npm start`

Wait for the script to finish, it can take a minute. Following output will be produced:

`./BasisBibel/Bibel`:  
Each book has its own folder, named e.g. "01 - 1. Mose 1".  
Each book has an entry file, e.g. "Buch 1. Mose.md". It links to the first chapter of the book.  
Each chapter has its own file, e.g. "1. Mose 1.md".  

`./BasisBibel/Randbemerkungen`:  
Each book has its own folder with side-notes, named e.g. "01 - 1. Mose 1".  
Each chapter has its own side-notes file, e.g. "1. Mose 1 - Randbemerkungen.md".  
Side-notes are linked to the verse in the chapter file they are refering to.  

You can simply copy the generated `BasisBibel` folder to your Obsidian vault!