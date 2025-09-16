// Main Application Controller
class EPUBReaderApp {
    constructor() {
        this.currentBook = null;
        this.currentChapter = 0;
        this.chapters = [];
        this.bookMetadata = {};
        this.availableBooks = [];
        
        // Auto-hide behavior state
        this.inactivityTimer = null;
        this.panelsVisible = true;
        this.isReadingMode = false;
        
        this.initializeApp();
    }

    initializeApp() {
        this.bindEvents();
        this.initializeDarkMode();
        this.initializeFontSize();
        this.initializeReadingInterface();
        this.loadAvailableBooks();
        console.log('EPUB Reader initialized');
    }

    async loadAvailableBooks() {
        try {
            // Load books from the manifest file
            this.availableBooks = await this.loadBooksFromManifest();
            this.renderAvailableBooks();
            console.log('Loaded books from manifest:', this.availableBooks);
        } catch (error) {
            console.error('Could not load books from manifest:', error);
            // Final fallback: single hardcoded book
            this.showError('Could not load the book library. Please try again later.');
        }
    }

    async loadBooksFromManifest() {
        try {
            const response = await fetch('assets/books/books.json');
            if (!response.ok) {
                throw new Error('Could not fetch books.json');
            }
            const books = await response.json();
            return books;
        } catch (error) {
            console.error('Error loading books from manifest:', error);
            return [];
        }
    }

    renderAvailableBooks() {
        const booksGrid = document.getElementById('books-grid');
        if (!booksGrid) return;

        // Clear loading message
        booksGrid.innerHTML = '';

        // Set adaptive grid attribute based on book count
        booksGrid.setAttribute('data-book-count', this.availableBooks.length);

        // Render each book
        this.availableBooks.forEach((book, index) => {
            const bookCard = document.createElement('div');
            bookCard.className = 'book-card';
            bookCard.innerHTML = `
                <div class="book-cover">
                    ${book.coverUrl ? 
                        `<img src="${book.coverUrl}" alt="${book.title} Cover" style="max-width: 100%; max-height: 200px; border-radius: 4px;">` :
                        '<div class="cover-placeholder">📖</div>'
                    }
                </div>
                <h3>${book.title}</h3>
                <p class="book-author">by ${book.author}</p>
                <p class="book-description">${book.description}</p>
                <button class="read-btn" data-book-index="${index}">Start Reading</button>
            `;

            // Add click event to the entire card
            bookCard.addEventListener('click', (e) => {
                // Don't trigger if clicking the button directly
                if (!e.target.classList.contains('read-btn')) {
                    this.loadBookFromPath(book.filename);
                }
            });

            // Add click event to the read button
            const readBtn = bookCard.querySelector('.read-btn');
            readBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.loadBookFromPath(book.filename);
            });

            booksGrid.appendChild(bookCard);
        });

        console.log(`Rendered ${this.availableBooks.length} books`);
    }

    async loadBookFromPath(filename) {
        try {
            this.showLoading(`Loading ${filename}...`);
            
            const response = await fetch(`assets/books/${filename}`);
            if (!response.ok) {
                throw new Error(`Could not load book: ${filename}`);
            }
            
            const arrayBuffer = await response.arrayBuffer();
            await this.parseEPUB(arrayBuffer, filename);
            
        } catch (error) {
            console.error('Error loading book from path:', error);
            this.showError(`Failed to load ${filename}. Please try again.`);
        }
    }

    bindEvents() {
        // Dynamic book event binding happens in renderAvailableBooks()

        // File upload input
        const fileInput = document.getElementById('epub-file-input');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        }

        // Whole window drag and drop
        document.addEventListener('dragover', (e) => this.handleWindowDragOver(e));
        document.addEventListener('dragleave', (e) => this.handleWindowDragLeave(e));
        document.addEventListener('drop', (e) => this.handleWindowFileDrop(e));


        // Navigation buttons
        const prevBtn = document.getElementById('prev-page');
        const nextBtn = document.getElementById('next-page');
        if (prevBtn) prevBtn.addEventListener('click', () => this.previousChapter());
        if (nextBtn) nextBtn.addEventListener('click', () => this.nextChapter());

        // Back to library button
        const backBtn = document.getElementById('back-to-library');
        if (backBtn) backBtn.addEventListener('click', () => this.showBookSelection());

        // Return to TOC button
        const tocBtn = document.getElementById('return-to-toc');
        if (tocBtn) tocBtn.addEventListener('click', () => this.returnToTOC());

        // Retry button
        const retryBtn = document.getElementById('retry-btn');
        if (retryBtn) retryBtn.addEventListener('click', () => this.hideError());
        
        // Dark mode toggle
        const darkModeToggle = document.getElementById('dark-mode-toggle');
        if (darkModeToggle) darkModeToggle.addEventListener('click', () => this.toggleDarkMode());
        
        // Font size controls
        const fontDecreaseBtn = document.getElementById('font-decrease');
        const fontIncreaseBtn = document.getElementById('font-increase');
        const fontSizeInput = document.getElementById('font-size-input');
        
        if (fontDecreaseBtn) fontDecreaseBtn.addEventListener('click', () => this.decreaseFontSize());
        if (fontIncreaseBtn) fontIncreaseBtn.addEventListener('click', () => this.increaseFontSize());
        if (fontSizeInput) {
            fontSizeInput.addEventListener('change', (e) => this.setFontSize(parseInt(e.target.value)));
            fontSizeInput.addEventListener('input', (e) => this.validateFontSizeInput(e));
        }
    }

    handleFileSelect(event) {
        const file = event.target.files[0];
        if (file) {
            this.loadEPUBFile(file);
        }
    }

    // Window-level drag and drop handlers
    handleWindowDragOver(event) {
        event.preventDefault();
        event.stopPropagation();
        
        // Only show drag overlay if we're on the book selection page
        const bookSelection = document.getElementById('book-selection');
        if (bookSelection && bookSelection.style.display !== 'none') {
            document.body.classList.add('drag-active');
        }
    }

    handleWindowDragLeave(event) {
        event.preventDefault();
        event.stopPropagation();
        
        // Only remove overlay if we're actually leaving the window
        if (event.clientX === 0 && event.clientY === 0) {
            document.body.classList.remove('drag-active');
        }
    }

    handleWindowFileDrop(event) {
        event.preventDefault();
        event.stopPropagation();
        document.body.classList.remove('drag-active');
        
        // Only handle drops on the book selection page
        const bookSelection = document.getElementById('book-selection');
        if (!bookSelection || bookSelection.style.display === 'none') {
            return;
        }
        
        const files = event.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            if (file.name.toLowerCase().endsWith('.epub')) {
                this.loadEPUBFile(file);
            } else {
                this.showError('Please select a valid EPUB file.');
            }
        }
    }

    async loadEPUBFile(file) {
        try {
            this.showLoading(`Loading ${file.name}...`);
            
            const arrayBuffer = await file.arrayBuffer();
            await this.parseEPUB(arrayBuffer, file.name);
            
        } catch (error) {
            console.error('Error loading EPUB file:', error);
            this.showError('Failed to load the EPUB file. Please ensure it is a valid EPUB format.');
        }
    }

    async parseEPUB(arrayBuffer, fileName) {
        try {
            console.log('Parsing EPUB:', fileName);
            
            // Use JSZip to extract the EPUB (ZIP) file
            const zip = await JSZip.loadAsync(arrayBuffer);
            console.log('ZIP loaded successfully');
            
            // Check for mimetype file
            const mimetypeFile = zip.file('mimetype');
            if (mimetypeFile) {
                const mimetype = await mimetypeFile.async('text');
                if (mimetype.trim() !== 'application/epub+zip') {
                    console.warn('Invalid EPUB mimetype:', mimetype);
                }
            }
            
            // Read container.xml to find the OPF file
            const containerFile = zip.file('META-INF/container.xml');
            if (!containerFile) {
                throw new Error('META-INF/container.xml not found in EPUB');
            }
            
            const containerXML = await containerFile.async('text');
            const parser = new DOMParser();
            const containerDoc = parser.parseFromString(containerXML, 'application/xml');
            
            // Check for XML parsing errors
            const parserError = containerDoc.querySelector('parsererror');
            if (parserError) {
                throw new Error('Failed to parse container.xml: ' + parserError.textContent);
            }
            
            // Get OPF file path
            const rootfileElement = containerDoc.querySelector('rootfile[media-type="application/oebps-package+xml"]');
            const opfPath = rootfileElement?.getAttribute('full-path');
            
            if (!opfPath) {
                throw new Error('Could not find OPF file path in container.xml');
            }
            
            console.log('OPF file path:', opfPath);
            
            // Parse OPF file
            const opfFile = zip.file(opfPath);
            if (!opfFile) {
                throw new Error(`OPF file not found: ${opfPath}`);
            }
            
            const opfContent = await opfFile.async('text');
            const opfDoc = parser.parseFromString(opfContent, 'application/xml');
            
            // Check for XML parsing errors
            const opfParserError = opfDoc.querySelector('parsererror');
            if (opfParserError) {
                throw new Error('Failed to parse OPF file: ' + opfParserError.textContent);
            }
            
            // Extract metadata
            this.extractMetadata(opfDoc);
            
            // Extract cover image
            await this.extractCover(opfDoc, zip, opfPath);
            
            // Update cover display in UI
            this.updateCoverDisplay();
            
            // Extract spine (reading order) - await this async operation
            await this.extractSpine(opfDoc, zip, opfPath);
            
            // Start reading
            await this.startReading();
            
        } catch (error) {
            console.error('Error parsing EPUB:', error);
            this.showError(`Failed to parse EPUB file: ${error.message}`);
        }
    }

    extractMetadata(opfDoc) {
        const metadata = opfDoc.querySelector('metadata');
        this.bookMetadata = {
            title: 'Unknown Title',
            creator: 'Unknown Author',
            language: 'en',
            identifier: '',
            coverUrl: null
        };
        
        if (metadata) {
            // Try multiple ways to get title (with and without namespace)
            const titleElement = metadata.querySelector('title') || 
                                metadata.querySelector('dc\\:title') ||
                                metadata.querySelector('[name="title"]');
            if (titleElement) {
                this.bookMetadata.title = titleElement.textContent.trim();
            }
            
            // Try multiple ways to get creator/author
            const creatorElement = metadata.querySelector('creator') || 
                                 metadata.querySelector('dc\\:creator') ||
                                 metadata.querySelector('[name="creator"]');
            if (creatorElement) {
                this.bookMetadata.creator = creatorElement.textContent.trim();
            }
            
            // Try multiple ways to get language
            const languageElement = metadata.querySelector('language') || 
                                  metadata.querySelector('dc\\:language') ||
                                  metadata.querySelector('[name="language"]');
            if (languageElement) {
                this.bookMetadata.language = languageElement.textContent.trim();
            }
            
            // Try multiple ways to get identifier
            const identifierElement = metadata.querySelector('identifier') || 
                                    metadata.querySelector('dc\\:identifier') ||
                                    metadata.querySelector('[name="identifier"]');
            if (identifierElement) {
                this.bookMetadata.identifier = identifierElement.textContent.trim();
            }
        }
        console.log('Book metadata:', this.bookMetadata);
    }

    async extractCover(opfDoc, zip, opfPath) {
        try {
            const basePath = opfPath.split('/').slice(0, -1).join('/');
            const manifest = {};
            
            // Build manifest (file references)
            const manifestItems = opfDoc.querySelectorAll('manifest item');
            manifestItems.forEach(item => {
                const id = item.getAttribute('id');
                const href = item.getAttribute('href');
                const mediaType = item.getAttribute('media-type');
                manifest[id] = { href, mediaType };
            });
            
            let coverImagePath = null;
            
            // Method 1: Look for cover metadata
            const coverMetadata = opfDoc.querySelector('meta[name="cover"]');
            if (coverMetadata) {
                const coverId = coverMetadata.getAttribute('content');
                if (manifest[coverId]) {
                    coverImagePath = manifest[coverId].href;
                }
            }
            
            // Method 2: Look for cover image in guide section
            if (!coverImagePath) {
                const coverGuide = opfDoc.querySelector('guide reference[type="cover"]');
                if (coverGuide) {
                    const href = coverGuide.getAttribute('href');
                    if (href) {
                        // Extract image from HTML cover page
                        const coverPagePath = basePath ? `${basePath}/${href}` : href;
                        try {
                            const coverPageFile = zip.file(coverPagePath);
                            if (coverPageFile) {
                                const coverPageContent = await coverPageFile.async('text');
                                const parser = new DOMParser();
                                const coverDoc = parser.parseFromString(coverPageContent, 'text/html');
                                const imgElement = coverDoc.querySelector('img');
                                if (imgElement) {
                                    coverImagePath = imgElement.getAttribute('src');
                                }
                            }
                        } catch (error) {
                            console.warn('Could not extract cover from guide page:', error);
                        }
                    }
                }
            }
            
            // Method 3: Look for common cover image names in manifest
            if (!coverImagePath) {
                const coverNames = ['cover', 'Cover', 'COVER', 'cover-image', 'coverimage'];
                for (const [id, item] of Object.entries(manifest)) {
                    if (item.mediaType && item.mediaType.startsWith('image/')) {
                        for (const coverName of coverNames) {
                            if (id.toLowerCase().includes(coverName.toLowerCase()) || 
                                item.href.toLowerCase().includes(coverName.toLowerCase())) {
                                coverImagePath = item.href;
                                break;
                            }
                        }
                        if (coverImagePath) break;
                    }
                }
            }
            
            // Method 4: Use first image in manifest as fallback
            if (!coverImagePath) {
                for (const [id, item] of Object.entries(manifest)) {
                    if (item.mediaType && item.mediaType.startsWith('image/')) {
                        coverImagePath = item.href;
                        break;
                    }
                }
            }
            
            if (coverImagePath) {
                const fullCoverPath = basePath ? `${basePath}/${coverImagePath}` : coverImagePath;
                try {
                    const coverFile = zip.file(fullCoverPath);
                    if (coverFile) {
                        const coverData = await coverFile.async('base64');
                        const mimeType = this.getMimeTypeFromPath(coverImagePath);
                        this.bookMetadata.coverUrl = `data:${mimeType};base64,${coverData}`;
                        console.log('Cover image extracted successfully');
                    }
                } catch (error) {
                    console.warn('Could not extract cover image:', error);
                }
            } else {
                console.log('No cover image found in EPUB');
            }
            
        } catch (error) {
            console.warn('Error extracting cover:', error);
        }
    }
    
    getMimeTypeFromPath(path) {
        const extension = path.split('.').pop().toLowerCase();
        const mimeTypes = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'svg': 'image/svg+xml'
        };
        return mimeTypes[extension] || 'image/jpeg';
    }

    async extractImages(zip, manifest, basePath) {
        try {
            console.log('Extracting images from EPUB...');
            
            // Find all image files in the manifest
            const imageFiles = [];
            for (const [id, item] of Object.entries(manifest)) {
                if (item.mediaType && item.mediaType.startsWith('image/')) {
                    imageFiles.push({
                        id: id,
                        href: item.href,
                        mediaType: item.mediaType,
                        fullPath: basePath ? `${basePath}/${item.href}` : item.href
                    });
                }
            }
            
            console.log(`Found ${imageFiles.length} images in manifest`);
            
            // Extract each image and create data URL
            for (const imageFile of imageFiles) {
                try {
                    const file = zip.file(imageFile.fullPath);
                    if (file) {
                        const imageData = await file.async('base64');
                        const dataUrl = `data:${imageFile.mediaType};base64,${imageData}`;
                        
                        // Store with multiple possible path variations
                        this.imageDataUrls.set(imageFile.href, dataUrl);
                        this.imageDataUrls.set(imageFile.fullPath, dataUrl);
                        
                        // Also store with different relative path variations
                        const fileName = imageFile.href.split('/').pop();
                        this.imageDataUrls.set(fileName, dataUrl);
                        this.imageDataUrls.set(`../${imageFile.href}`, dataUrl);
                        this.imageDataUrls.set(`../images/${fileName}`, dataUrl);
                        this.imageDataUrls.set(`images/${fileName}`, dataUrl);
                        
                        console.log(`Extracted image: ${imageFile.href}`);
                    }
                } catch (error) {
                    console.warn(`Could not extract image: ${imageFile.fullPath}`, error);
                }
            }
            
            console.log(`Successfully extracted ${this.imageDataUrls.size / imageFiles.length} image variations`);
            
        } catch (error) {
            console.warn('Error extracting images:', error);
        }
    }

    processImagesInContent(content, chapterBasePath) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(content, 'text/html');
            const images = doc.querySelectorAll('img');
            
            let replacedCount = 0;
            
            images.forEach(img => {
                const originalSrc = img.getAttribute('src');
                if (!originalSrc) return;
                
                // Try to find the image in our extracted data URLs
                let dataUrl = null;
                
                // Try direct match first
                if (this.imageDataUrls.has(originalSrc)) {
                    dataUrl = this.imageDataUrls.get(originalSrc);
                } else {
                    // Try resolving relative paths
                    const possiblePaths = [
                        originalSrc,
                        originalSrc.replace(/^\.\.\//, ''),
                        originalSrc.replace(/^\.\//, ''),
                        originalSrc.split('/').pop(), // Just filename
                        `images/${originalSrc.split('/').pop()}`, // Common images folder
                        `${chapterBasePath}/${originalSrc}` // Resolve relative to chapter
                    ];
                    
                    for (const path of possiblePaths) {
                        if (this.imageDataUrls.has(path)) {
                            dataUrl = this.imageDataUrls.get(path);
                            break;
                        }
                    }
                }
                
                if (dataUrl) {
                    img.setAttribute('src', dataUrl);
                    img.removeAttribute('onerror'); // Remove any error handlers
                    replacedCount++;
                    console.log(`Replaced image source: ${originalSrc}`);
                } else {
                    console.warn(`Could not find data URL for image: ${originalSrc}`);
                    // Add a placeholder or error handling
                    img.setAttribute('alt', `Image not found: ${originalSrc}`);
                    img.style.border = '2px dashed #ccc';
                    img.style.padding = '1rem';
                    img.style.backgroundColor = '#f9f9f9';
                }
            });
            
            if (replacedCount > 0) {
                console.log(`Successfully replaced ${replacedCount} image sources in chapter content`);
            }
            
            // Return the processed HTML
            return doc.documentElement.outerHTML;
            
        } catch (error) {
            console.warn('Error processing images in content:', error);
            return content; // Return original content if processing fails
        }
    }

    updateCoverDisplay() {
        // Keep main menu with book icon - cover will be shown as first reading page
        console.log('Cover extracted and ready for display in reading interface');
    }

    async extractSpine(opfDoc, zip, opfPath) {
        const basePath = opfPath.split('/').slice(0, -1).join('/');
        const manifest = {};
        
        // Build manifest (file references)
        const manifestItems = opfDoc.querySelectorAll('manifest item');
        manifestItems.forEach(item => {
            const id = item.getAttribute('id');
            const href = item.getAttribute('href');
            const mediaType = item.getAttribute('media-type');
            manifest[id] = { href, mediaType };
        });
        
        // Extract all images from EPUB and create data URLs
        this.imageDataUrls = new Map();
        await this.extractImages(zip, manifest, basePath);
        
        // Extract spine (reading order)
        const spineItems = opfDoc.querySelectorAll('spine itemref');
        const allChapters = [];
        
        for (const item of spineItems) {
            const idref = item.getAttribute('idref');
            const manifestItem = manifest[idref];
            
            if (manifestItem && (manifestItem.mediaType === 'application/xhtml+xml' || manifestItem.mediaType === 'text/html')) {
                const fullPath = basePath ? `${basePath}/${manifestItem.href}` : manifestItem.href;
                
                try {
                    const content = await zip.file(fullPath).async('text');
                    
                    // Extract chapter title from content
                    const chapterTitle = this.extractChapterTitle(content, allChapters.length + 1);
                    
                    allChapters.push({
                        id: idref,
                        path: fullPath,
                        content: content,
                        title: chapterTitle,
                        basePath: basePath // Store basePath for relative resource resolution
                    });
                } catch (error) {
                    console.warn(`Could not load chapter: ${fullPath}`, error);
                }
            }
        }
        
        // Filter out problematic chapters (image-only, title pages, etc.)
        this.chapters = this.filterReadableChapters(allChapters);
        
        console.log(`Loaded ${allChapters.length} total chapters, filtered to ${this.chapters.length} readable chapters`);
        console.log(`Extracted ${this.imageDataUrls.size} images for rendering`);
    }
    
    extractChapterTitle(content, chapterNumber) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(content, 'text/html');
            
            // Look for title in various places
            let title = null;
            
            // Try to find h1, h2, h3 tags
            const headings = doc.querySelectorAll('h1, h2, h3');
            if (headings.length > 0) {
                title = headings[0].textContent.trim();
            }
            
            // Try to find title tag
            if (!title) {
                const titleTag = doc.querySelector('title');
                if (titleTag) {
                    title = titleTag.textContent.trim();
                }
            }
            
            // Try to find elements with common chapter class names
            if (!title) {
                const chapterElements = doc.querySelectorAll('.chapter-title, .chapter-heading, .title, .heading');
                if (chapterElements.length > 0) {
                    title = chapterElements[0].textContent.trim();
                }
            }
            
            // Clean up the title
            if (title) {
                title = title.replace(/^\s*chapter\s+\d+\s*:?\s*/i, '').trim();
                if (title.length > 50) {
                    title = title.substring(0, 50) + '...';
                }
                return title || `Chapter ${chapterNumber}`;
            }
            
        } catch (error) {
            console.warn('Error extracting chapter title:', error);
        }
        
        return `Chapter ${chapterNumber}`;
    }

    filterReadableChapters(allChapters) {
        const readableChapters = [];
        
        for (let i = 0; i < allChapters.length; i++) {
            const chapter = allChapters[i];
            
            if (this.isChapterReadable(chapter)) {
                // Update chapter numbering for filtered chapters
                chapter.title = this.extractChapterTitle(chapter.content, readableChapters.length + 1);
                readableChapters.push(chapter);
            } else {
                console.log(`Filtered out chapter: "${chapter.title}" (primarily images or minimal content)`);
            }
        }
        
        return readableChapters;
    }

    isChapterReadable(chapter) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(chapter.content, 'text/html');
            
            // Get all text content, excluding script and style tags
            const textContent = doc.body ? doc.body.textContent : doc.textContent || '';
            const cleanText = textContent.replace(/\s+/g, ' ').trim();
            
            // Count images
            const images = doc.querySelectorAll('img');
            const imageCount = images.length;
            
            // Check for text length (minimum 100 characters of meaningful content)
            if (cleanText.length < 100) {
                return false;
            }
            
            // Skip if it's primarily images (more than 3 images with little text)
            if (imageCount > 3 && cleanText.length < 500) {
                return false;
            }
            
            // Skip common title/copyright page patterns
            const lowerText = cleanText.toLowerCase();
            const skipPatterns = [
                'copyright',
                'all rights reserved',
                'project gutenberg',
                'title page',
                'frontispiece',
                'this ebook is for the use of anyone anywhere'
            ];
            
            // If it's very short and matches skip patterns, filter it out
            if (cleanText.length < 300 && skipPatterns.some(pattern => lowerText.includes(pattern))) {
                return false;
            }
            
            // Skip if it has mostly just the book title and author
            const hasOnlyTitleAuthor = lowerText.includes('murder on the links') && 
                                     lowerText.includes('agatha christie') && 
                                     cleanText.length < 200;
            if (hasOnlyTitleAuthor) {
                return false;
            }
            
            return true;
            
        } catch (error) {
            console.warn('Error checking chapter readability:', error);
            return true; // If in doubt, include it
        }
    }

    async startReading() {
        if (this.chapters.length === 0) {
            throw new Error('No readable content found in EPUB');
        }
        
        // Start with cover page (chapter -1), then TOC ("toc"), then chapters 0, 1, 2, etc.
        this.currentChapter = -1;
        this.hideLoading();
        this.showReadingInterface();
        this.displayCurrentChapter();
    }

    displayCurrentChapter() {
        const contentArea = document.getElementById('chapter-content');
        const bookTitle = document.getElementById('current-book-title');
        const chapterInfo = document.getElementById('current-chapter');
        const pageInfo = document.getElementById('page-info');
        
        // Update book title
        if (bookTitle) bookTitle.textContent = this.bookMetadata.title;
        
        // Handle cover page (currentChapter = -1)
        if (this.currentChapter === -1) {
            if (chapterInfo) chapterInfo.textContent = "Cover";
            if (pageInfo) pageInfo.textContent = `Cover • ${this.chapters.length} chapters`;
            
            // Display cover image or fallback
            if (contentArea) {
                if (this.bookMetadata.coverUrl) {
                    contentArea.innerHTML = `
                        <div style="display: flex; justify-content: center; align-items: center; min-height: 60vh; text-align: center;">
                            <div>
                                <img src="${this.bookMetadata.coverUrl}" alt="Book Cover" style="max-width: 100%; max-height: 70vh; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
                                <h2 style="margin-top: 1rem; font-size: 1.5rem; color: var(--text-color, #333); text-align: center; width: 100%;">${this.bookMetadata.title}</h2>
                                <p style="margin-top: 0.5rem; font-size: 1.1rem; color: var(--text-secondary, #666); text-align: center; width: 100%;">by ${this.bookMetadata.creator}</p>
                            </div>
                        </div>
                    `;
                    console.log('Displaying cover page with extracted cover image');
                } else {
                    contentArea.innerHTML = `
                        <div style="display: flex; justify-content: center; align-items: center; min-height: 60vh; text-align: center;">
                            <div>
                                <div style="font-size: 4rem; margin-bottom: 1rem;">📖</div>
                                <h2 style="margin-top: 1rem; font-size: 1.5rem; color: var(--text-color, #333); text-align: center; width: 100%;">${this.bookMetadata.title}</h2>
                                <p style="margin-top: 0.5rem; font-size: 1.1rem; color: var(--text-secondary, #666); text-align: center; width: 100%;">by ${this.bookMetadata.creator}</p>
                            </div>
                        </div>
                    `;
                    console.log('Displaying cover page with placeholder icon');
                }
            }
        } else if (this.currentChapter === "toc") {
            // Handle Table of Contents page
            if (chapterInfo) chapterInfo.textContent = "Table of Contents";
            if (pageInfo) pageInfo.textContent = `Contents • ${this.chapters.length} chapters`;
            
            // Generate table of contents
            if (contentArea) {
                let tocHTML = `
                    <div style="max-width: 600px; margin: 0 auto; padding: 2rem;">
                        <h1 style="text-align: center; margin-bottom: 2rem; font-size: 2rem; color: var(--text-color);">Table of Contents</h1>
                        <div style="border-top: 2px solid var(--border-color, #e0e0e0); padding-top: 1.5rem;">
                `;
                
                this.chapters.forEach((chapter, index) => {
                    tocHTML += `
                        <div style="margin-bottom: 1rem; padding: 0.8rem; border-radius: 8px; cursor: pointer; transition: background-color 0.2s ease; border-left: 3px solid var(--accent-color, #007bff);" 
                             class="toc-item" 
                             data-chapter-index="${index}"
                             onmouseover="this.style.backgroundColor='var(--bg-hover, #f8f9fa)'" 
                             onmouseout="this.style.backgroundColor='transparent'">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <h3 style="margin: 0 0 0.3rem 0; font-size: 1.1rem; color: var(--text-color);">${chapter.title}</h3>
                                    <p style="margin: 0; font-size: 0.9rem; color: var(--text-secondary, #666);">Chapter ${index + 1}</p>
                                </div>
                                <div style="font-size: 0.9rem; color: var(--text-secondary, #666);">→</div>
                            </div>
                        </div>
                    `;
                });
                
                tocHTML += `
                        </div>
                        <div style="text-align: center; margin-top: 2rem; font-size: 0.9rem; color: var(--text-secondary, #666);">
                            Click any chapter to jump directly to it
                        </div>
                    </div>
                `;
                
                contentArea.innerHTML = tocHTML;
                
                // Add event listeners to TOC items
                const tocItems = contentArea.querySelectorAll('.toc-item');
                tocItems.forEach(item => {
                    item.addEventListener('click', (e) => {
                        const chapterIndex = parseInt(item.getAttribute('data-chapter-index'));
                        console.log('TOC item clicked, chapter index:', chapterIndex);
                        this.jumpToChapter(chapterIndex);
                    });
                });
                
                console.log('Displaying table of contents with', tocItems.length, 'clickable items');
            }
        } else {
            // Handle regular chapters
            const chapter = this.chapters[this.currentChapter];
            if (!chapter) return;
            
            if (chapterInfo) chapterInfo.textContent = chapter.title;
            if (pageInfo) pageInfo.textContent = `${this.currentChapter + 1} of ${this.chapters.length}`;
            
            // Parse and display chapter content with image processing
            if (contentArea) {
                // Process images in the chapter content
                const processedContent = this.processImagesInContent(chapter.content, chapter.basePath);
                
                const parser = new DOMParser();
                const doc = parser.parseFromString(processedContent, 'text/html');
                const body = doc.querySelector('body');
                
                if (body) {
                    contentArea.innerHTML = body.innerHTML;
                } else {
                    contentArea.innerHTML = processedContent;
                }
            }
            
            console.log(`Displaying chapter ${this.currentChapter + 1} of ${this.chapters.length}`);
        }
        
        // Update navigation buttons
        this.updateNavigationButtons();
    }

    updateNavigationButtons() {
        const prevBtn = document.getElementById('prev-page');
        const nextBtn = document.getElementById('next-page');
        const tocBtn = document.getElementById('return-to-toc');
        
        if (prevBtn) {
            // Disable previous if on cover page (chapter -1)
            prevBtn.disabled = this.currentChapter === -1;
        }
        
        if (nextBtn) {
            // Disable next if on last chapter, but allow TOC navigation
            if (this.currentChapter === -1 || this.currentChapter === "toc") {
                nextBtn.disabled = false; // Always allow next from cover and TOC
            } else {
                nextBtn.disabled = this.currentChapter >= this.chapters.length - 1;
            }
        }
        
        if (tocBtn) {
            // Show TOC button only when reading actual chapters (not on cover or TOC pages)
            if (this.currentChapter >= 0) {
                tocBtn.style.display = 'block';
            } else {
                tocBtn.style.display = 'none';
            }
        }
    }

    previousChapter() {
        if (this.currentChapter === "toc") {
            // From TOC, go back to cover
            this.currentChapter = -1;
        } else if (this.currentChapter === 0) {
            // From first chapter, go back to TOC
            this.currentChapter = "toc";
        } else if (this.currentChapter > 0) {
            // Regular chapter navigation
            this.currentChapter--;
        }
        this.displayCurrentChapter();
    }

    nextChapter() {
        if (this.currentChapter === -1) {
            // From cover, go to TOC
            this.currentChapter = "toc";
        } else if (this.currentChapter === "toc") {
            // From TOC, go to first chapter
            this.currentChapter = 0;
        } else if (this.currentChapter < this.chapters.length - 1) {
            // Regular chapter navigation
            this.currentChapter++;
        }
        this.displayCurrentChapter();
    }

    jumpToChapter(chapterIndex) {
        if (chapterIndex >= 0 && chapterIndex < this.chapters.length) {
            this.currentChapter = chapterIndex;
            this.displayCurrentChapter();
        }
    }

    returnToTOC() {
        this.currentChapter = "toc";
        this.displayCurrentChapter();
    }

    showBookSelection() {
        document.getElementById('book-selection').style.display = 'block';
        document.getElementById('reading-interface').style.display = 'none';
        this.hideLoading();
        this.hideError();
    }

    showReadingInterface() {
        document.getElementById('book-selection').style.display = 'none';
        document.getElementById('reading-interface').style.display = 'block';
    }

    showLoading(message = 'Loading...') {
        const overlay = document.getElementById('status-overlay');
        const spinner = document.getElementById('loading-spinner');
        const error = document.getElementById('error-message');
        
        if (overlay) overlay.style.display = 'flex';
        if (spinner) {
            spinner.style.display = 'block';
            const loadingText = spinner.querySelector('p');
            if (loadingText) loadingText.textContent = message;
        }
        if (error) error.style.display = 'none';
    }

    hideLoading() {
        const overlay = document.getElementById('status-overlay');
        const spinner = document.getElementById('loading-spinner');
        
        if (overlay) overlay.style.display = 'none';
        if (spinner) spinner.style.display = 'none';
    }

    showError(message) {
        const overlay = document.getElementById('status-overlay');
        const spinner = document.getElementById('loading-spinner');
        const error = document.getElementById('error-message');
        const errorText = document.getElementById('error-text');
        
        if (overlay) overlay.style.display = 'flex';
        if (spinner) spinner.style.display = 'none';
        if (error) error.style.display = 'block';
        if (errorText) errorText.textContent = message;
    }

    hideError() {
        const overlay = document.getElementById('status-overlay');
        const error = document.getElementById('error-message');
        
        if (overlay) overlay.style.display = 'none';
        if (error) error.style.display = 'none';
    }
    
    // Font Size Management
    decreaseFontSize() {
        const currentSize = this.getCurrentFontSize();
        const newSize = Math.max(12, currentSize - 1); // Min 12px
        this.setFontSize(newSize);
    }
    
    increaseFontSize() {
        const currentSize = this.getCurrentFontSize();
        const newSize = Math.min(32, currentSize + 1); // Max 32px
        this.setFontSize(newSize);
    }
    
    setFontSize(size) {
        // Enforce constraints
        const constrainedSize = Math.max(12, Math.min(32, size));
        
        // Update chapter content font size
        const chapterContent = document.getElementById('chapter-content');
        if (chapterContent) {
            chapterContent.style.fontSize = `${constrainedSize}px`;
        }
        
        // Update input field
        const fontSizeInput = document.getElementById('font-size-input');
        if (fontSizeInput) {
            fontSizeInput.value = constrainedSize;
        }
        
        // Save to localStorage
        localStorage.setItem('epub-reader-font-size', constrainedSize.toString());
        
        console.log(`Font size set to ${constrainedSize}px`);
    }
    
    getCurrentFontSize() {
        const fontSizeInput = document.getElementById('font-size-input');
        return fontSizeInput ? parseInt(fontSizeInput.value) || 16 : 16;
    }
    
    validateFontSizeInput(event) {
        const value = parseInt(event.target.value);
        if (isNaN(value) || value < 12 || value > 32) {
            // Reset to current valid value if invalid input
            event.target.value = this.getCurrentFontSize();
        }
    }
    
    initializeFontSize() {
        const savedFontSize = localStorage.getItem('epub-reader-font-size');
        const defaultSize = 16;
        
        let fontSize = defaultSize;
        if (savedFontSize !== null) {
            const parsedSize = parseInt(savedFontSize);
            if (!isNaN(parsedSize) && parsedSize >= 12 && parsedSize <= 32) {
                fontSize = parsedSize;
            }
        }
        
        // Set initial font size
        this.setFontSize(fontSize);
        
        console.log('Font size initialized:', fontSize);
    }
    
    toggleDarkMode() {
        const body = document.body;
        const toggle = document.getElementById('dark-mode-toggle');
        
        if (body.classList.contains('dark-mode')) {
            // Switch to light mode
            body.classList.remove('dark-mode');
            toggle.textContent = '🌙';
            toggle.title = 'Switch to Dark Mode';
            localStorage.setItem('epub-reader-dark-mode', 'false');
            console.log('Switched to light mode');
        } else {
            // Switch to dark mode
            body.classList.add('dark-mode');
            toggle.textContent = '☀️';
            toggle.title = 'Switch to Light Mode';
            localStorage.setItem('epub-reader-dark-mode', 'true');
            console.log('Switched to dark mode');
        }
    }
    
    initializeDarkMode() {
        const savedDarkMode = localStorage.getItem('epub-reader-dark-mode');
        const toggle = document.getElementById('dark-mode-toggle');
        const body = document.body;
        
        // Check for saved preference, otherwise check system preference
        let isDarkMode = false;
        
        if (savedDarkMode !== null) {
            // Use saved preference
            isDarkMode = savedDarkMode === 'true';
        } else {
            // Check system preference
            isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        }
        
        if (isDarkMode) {
            body.classList.add('dark-mode');
            if (toggle) {
                toggle.textContent = '☀️';
                toggle.title = 'Switch to Light Mode';
            }
        } else {
            body.classList.remove('dark-mode');
            if (toggle) {
                toggle.textContent = '🌙';
                toggle.title = 'Switch to Dark Mode';
            }
        }
        
        console.log('Dark mode initialized:', isDarkMode);
    }
    
    initializeReadingInterface() {
        // Initialize panels as visible by default
        this.showPanels();
        
        // Set up auto-hide behavior for reading mode
        this.setupAutoHideBehavior();
        
        console.log('Reading interface initialized');
    }
    
    setupAutoHideBehavior() {
        const readingInterface = document.getElementById('reading-interface');
        if (!readingInterface) return;
        
        // Mouse movement and interaction handlers
        const handleUserActivity = () => {
            this.showPanels();
            this.resetInactivityTimer();
        };
        
        // Show panels on mouse movement near edges
        const handleMouseMove = (e) => {
            const windowWidth = window.innerWidth;
            const edgeThreshold = 120; // Match CSS hover zone width
            
            // Show panels if mouse is near edges or panels are hovered
            if (e.clientX <= edgeThreshold || e.clientX >= windowWidth - edgeThreshold) {
                this.showPanels();
                this.resetInactivityTimer();
            }
        };
        
        // Show panels on scroll activity
        const handleScroll = () => {
            this.showPanels();
            this.resetInactivityTimer();
        };
        
        // Show panels on key press
        const handleKeyPress = (e) => {
            this.showPanels();
            this.resetInactivityTimer();
            
            // Add keyboard shortcuts
            if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
                e.preventDefault();
                this.previousChapter();
            } else if (e.code === 'ArrowRight' || e.code === 'KeyD' || e.code === 'Space') {
                e.preventDefault();
                this.nextChapter();
            } else if (e.code === 'KeyT') {
                e.preventDefault();
                this.returnToTOC();
            } else if (e.code === 'KeyL') {
                e.preventDefault();
                this.showBookSelection();
            }
        };
        
        // Touch interactions for mobile
        const handleTouch = () => {
            this.showPanels();
            this.resetInactivityTimer();
        };
        
        // Add event listeners
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('scroll', handleScroll);
        document.addEventListener('keydown', handleKeyPress);
        document.addEventListener('touchstart', handleTouch);
        document.addEventListener('touchmove', handleTouch);
        
        // Panel hover events
        const leftPanel = document.getElementById('left-panel');
        const rightPanel = document.getElementById('right-panel');
        
        if (leftPanel) {
            leftPanel.addEventListener('mouseenter', () => this.showPanels());
            leftPanel.addEventListener('mouseleave', () => this.resetInactivityTimer());
        }
        
        if (rightPanel) {
            rightPanel.addEventListener('mouseenter', () => this.showPanels());
            rightPanel.addEventListener('mouseleave', () => this.resetInactivityTimer());
        }
        
        // Start inactivity timer after initial delay
        this.resetInactivityTimer();
    }
    
    showPanels() {
        // Navigation panels (side panels)
        const leftPanel = document.getElementById('left-panel');
        const rightPanel = document.getElementById('right-panel');
        
        // Corner controls
        const topLeftControl = document.getElementById('top-left-control');
        const topRightControl = document.getElementById('top-right-control');
        const bottomLeftControl = document.getElementById('bottom-left-control');
        const bottomRightControl = document.getElementById('bottom-right-control');
        
        // Header
        const minimalHeader = document.getElementById('minimal-header');
        
        // Show all panels and controls
        if (leftPanel) leftPanel.classList.add('visible');
        if (rightPanel) rightPanel.classList.add('visible');
        if (topLeftControl) topLeftControl.classList.add('visible');
        if (topRightControl) topRightControl.classList.add('visible');
        if (bottomLeftControl) bottomLeftControl.classList.add('visible');
        if (bottomRightControl) bottomRightControl.classList.add('visible');
        if (minimalHeader) minimalHeader.classList.add('visible');
        
        this.panelsVisible = true;
    }
    
    hidePanels() {
        // Navigation panels (side panels)
        const leftPanel = document.getElementById('left-panel');
        const rightPanel = document.getElementById('right-panel');
        
        // Corner controls
        const topLeftControl = document.getElementById('top-left-control');
        const topRightControl = document.getElementById('top-right-control');
        const bottomLeftControl = document.getElementById('bottom-left-control');
        const bottomRightControl = document.getElementById('bottom-right-control');
        
        // Header
        const minimalHeader = document.getElementById('minimal-header');
        
        // Hide all panels and controls
        if (leftPanel) leftPanel.classList.remove('visible');
        if (rightPanel) rightPanel.classList.remove('visible');
        if (topLeftControl) topLeftControl.classList.remove('visible');
        if (topRightControl) topRightControl.classList.remove('visible');
        if (bottomLeftControl) bottomLeftControl.classList.remove('visible');
        if (bottomRightControl) bottomRightControl.classList.remove('visible');
        if (minimalHeader) minimalHeader.classList.remove('visible');
        
        this.panelsVisible = false;
    }
    
    resetInactivityTimer() {
        // Clear existing timer
        if (this.inactivityTimer) {
            clearTimeout(this.inactivityTimer);
        }
        
        // Only start auto-hide timer if we're reading actual content (not cover or TOC)
        if (this.currentChapter >= 0) {
            this.inactivityTimer = setTimeout(() => {
                this.enterReadingMode();
            }, 3000); // Hide after 3 seconds of inactivity
        }
    }
    
    enterReadingMode() {
        const readingInterface = document.getElementById('reading-interface');
        if (readingInterface) {
            readingInterface.classList.add('reading-mode');
        }
        
        this.hidePanels();
        this.isReadingMode = true;
        console.log('Entered reading mode - panels auto-hidden');
    }
    
    exitReadingMode() {
        const readingInterface = document.getElementById('reading-interface');
        if (readingInterface) {
            readingInterface.classList.remove('reading-mode');
        }
        
        this.showPanels();
        this.isReadingMode = false;
        console.log('Exited reading mode - panels visible');
    }
}

// Initialize the app when DOM is loaded
let app; // Global reference for TOC navigation
document.addEventListener('DOMContentLoaded', () => {
    app = new EPUBReaderApp();
});
