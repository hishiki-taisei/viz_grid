// --- グローバル変数 ---
const dropZone = document.getElementById('drop-zone');
const gridContainer = document.getElementById('grid-container');
const messageArea = document.getElementById('message-area');
const clearButton = document.getElementById('clear-button');
const fileInput = document.getElementById('file-input');
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');
const lightboxInfo = document.getElementById('lightbox-info');
const lightboxClose = document.getElementById('lightbox-close');
const lightboxPrev = document.getElementById('lightbox-prev');
const lightboxNext = document.getElementById('lightbox-next');
const folderListSection = document.getElementById('folder-list-section');
const folderList = document.getElementById('folder-list');
const fullscreenView = document.getElementById('fullscreen-view');
const fullscreenGrid = document.getElementById('fullscreen-grid');
const fullscreenClose = document.getElementById('fullscreen-close');
const folderFilterControls = document.getElementById('folder-filter-controls');
const filterSeedInput = document.getElementById('filter-seed');
const filterPersonalitySelect = document.getElementById('filter-personality');
const filterMemorySelect = document.getElementById('filter-memory');
const filterMemoryLengthInput = document.getElementById('filter-memory-length'); // 追加
const resetFilterButton = document.getElementById('reset-filter-button');
const toggleFolderListButton = document.getElementById('toggle-folder-list-button'); // 追加
const toggleGridParamsCheckbox = document.getElementById('toggle-grid-params'); // 追加
const gridParamsToggleContainer = document.getElementById('grid-params-toggle-container'); // 追加
let currentSortableInstance = null; // To hold the Sortable instance

// { filename: [{ folder: string, relativePath: string, file: File, dataUrl: string }] }
let imageGroups = {};
let processedFolderCount = 0;
let totalFoldersToProcess = 0;
let droppedFolders = new Set();
let folderParameters = {}; // Store parameters per folder { folderName: { usePersonality: bool, useMemory: bool, memoryLength: int, seed: number } }

// Filter state
let currentFilters = {
    seed: '',
    personality: '', // '', 'true', 'false'
    memory: '',       // '', 'true', 'false'
    memoryLength: '' // 追加 (数値または空文字)
};

// 追加: グリッドパラメータ表示状態
let showGridParams = true;
// 追加: 選択中のフォルダ名
let selectedFolderName = null;

// ライトボックス用状態変数
let currentLightboxGroup = []; // 現在ライトボックスで表示中のファイル名グループ
let currentLightboxIndex = -1; // 現在表示中の画像のインデックス

// --- イベントリスナー ---

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault(); e.stopPropagation(); dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault(); e.stopPropagation(); dropZone.classList.remove('drag-over');
});
dropZone.addEventListener('drop', handleDrop); // 関数化
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', handleFileInputChange); // 関数化
clearButton.addEventListener('click', handleClear); // 関数化

// ライトボックス関連のイベントリスナー
lightboxClose.addEventListener('click', closeLightbox);
lightboxPrev.addEventListener('click', showPrevImage);
lightboxNext.addEventListener('click', showNextImage);
// 背景クリックで閉じる（オプション）
lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) { // 背景自身がクリックされた場合のみ
        closeLightbox();
    }
});

// グリッド内のクリックイベントリスナーを修正
gridContainer.addEventListener('click', (e) => {
    // Find the closest ancestor which is either an image item or an html item link container
    const itemElement = e.target.closest('.image-item, .html-item');
    const header = e.target.closest('.filename-header');
    const toggleButton = e.target.closest('.toggle-group-button');

    if (itemElement) {
        // If it's an HTML item (which is an anchor tag itself), let the default action proceed.
        if (itemElement.classList.contains('html-item')) {
            console.log("HTML item link clicked, allowing default action.");
            // No return needed, default browser behavior handles the link
        } else if (itemElement.classList.contains('image-item')) {
            // It's an image item, open lightbox
            const filename = itemElement.dataset.filename;
            const index = parseInt(itemElement.dataset.index, 10);
            console.log(`Grid image clicked: filename=${filename}, index=${index}`);
            if (filename && !isNaN(index)) {
                openLightbox(filename, index);
            }
        }
    } else if (header) { // Handle header click for fullscreen view
        const filename = header.dataset.filename;
        console.log(`Filename header clicked: ${filename}`);
        if (filename) {
            openFullScreenView(filename);
        }
    } else if (toggleButton) { // Handle toggle button click
        const filename = toggleButton.dataset.filename;
        console.log(`Toggle button clicked for: ${filename}`);
        if (filename) {
            toggleGroupVisibility(filename, toggleButton);
        }
    }
});

// Folder list delete button listener (event delegation)
folderList.addEventListener('click', (e) => {
    const deleteButton = e.target.closest('.delete-folder-button');
    const folderNameContainer = e.target.closest('.folder-name-container');

    if (deleteButton) {
        const folderName = deleteButton.dataset.folderName;
        if (folderName) {
            removeFolder(folderName);
        }
    } else if (folderNameContainer) { // フォルダ名クリック時の処理を追加
        const folderName = folderNameContainer.dataset.folderName;
        if (folderName) {
            if (selectedFolderName === folderName) {
                // Already selected, deselect
                selectedFolderName = null;
                console.log("Folder deselected:", folderName);
            } else {
                // Select new folder
                selectedFolderName = folderName;
                console.log("Folder selected:", folderName);
            }
            renderFolderList(); // Update list highlighting
            renderGrid(); // Update grid view
        }
    }
});

// 追加: Folder list toggle button listener
toggleFolderListButton.addEventListener('click', () => {
    const isCollapsed = folderList.classList.toggle('folder-list-collapsed');
    if (isCollapsed) {
        toggleFolderListButton.textContent = '[+]';
        toggleFolderListButton.setAttribute('aria-label', 'フォルダ一覧を全表示');
        console.log("Folder list collapsed");
    } else {
        toggleFolderListButton.textContent = '[-]';
        toggleFolderListButton.setAttribute('aria-label', 'フォルダ一覧を一部表示');
        console.log("Folder list expanded");
    }
});

// 追加: Grid parameter toggle checkbox listener
toggleGridParamsCheckbox.addEventListener('change', () => {
    showGridParams = toggleGridParamsCheckbox.checked;
    console.log(`Grid parameter visibility toggled: ${showGridParams}`);
    renderGrid(); // Re-render grid with new setting
    // If fullscreen is open, re-render it too (optional, but good for consistency)
    if (document.body.classList.contains('fullscreen-open')) {
        const currentFullscreenFilename = fullscreenGrid.querySelector('.image-item')?.dataset.filename;
        if (currentFullscreenFilename) {
            // Re-open fullscreen view to apply changes; might cause a flicker
            openFullScreenView(currentFullscreenFilename);
        }
    }
});

// フルスクリーンビューのクローズボタンリスナー
fullscreenClose.addEventListener('click', closeFullScreenView);

// フルスクリーンビュー内の画像クリック（ライトボックスを開く）
fullscreenGrid.addEventListener('click', (e) => {
    const imageItem = e.target.closest('.image-item');
    if (imageItem) {
        const filename = imageItem.dataset.filename;
        const index = parseInt(imageItem.dataset.index, 10);
        console.log(`Fullscreen image clicked: filename=${filename}, index=${index}`);
        if (filename && !isNaN(index)) {
            openLightbox(filename, index);
        }
    }
});

// Filter input listeners
filterSeedInput.addEventListener('input', () => {
    currentFilters.seed = filterSeedInput.value.trim();
    renderFolderList(); // Re-render list on filter change
    renderGrid(); // Re-render grid on filter change
});
filterPersonalitySelect.addEventListener('change', () => {
    currentFilters.personality = filterPersonalitySelect.value;
    renderFolderList(); // Re-render list on filter change
    renderGrid(); // Re-render grid on filter change
});
filterMemorySelect.addEventListener('change', () => {
    currentFilters.memory = filterMemorySelect.value;
    renderFolderList(); // Re-render list on filter change
    renderGrid(); // Re-render grid on filter change
});
// 追加: Memory Length フィルターのリスナー
filterMemoryLengthInput.addEventListener('input', () => {
    currentFilters.memoryLength = filterMemoryLengthInput.value.trim();
    renderFolderList(); // Re-render list on filter change
    renderGrid(); // Re-render grid on filter change
});
resetFilterButton.addEventListener('click', resetFilters);

// --- ファイル/フォルダ処理関数 ---

async function handleDrop(e) {
    e.preventDefault(); e.stopPropagation();
    dropZone.classList.remove('drag-over');
    messageArea.textContent = 'フォルダを処理中...';
    console.log("Drop event triggered");

    const items = e.dataTransfer.items;
    const folderEntries = [];

    if (items) {
        for (let i = 0; i < items.length; i++) {
            const entry = items[i].webkitGetAsEntry();
            if (entry && entry.isDirectory && !droppedFolders.has(entry.name)) {
                folderEntries.push(entry);
                droppedFolders.add(entry.name);
                console.log(`Adding folder entry: ${entry.name}`);
            } else if (entry && entry.isDirectory && droppedFolders.has(entry.name)) {
                console.log(`Skipping already processed folder: ${entry.name}`);
            }
        }
    }

    if (folderEntries.length > 0) {
        const currentBatchSize = folderEntries.length;
        processedFolderCount = 0;
        clearButton.classList.remove('hidden');
        messageArea.textContent = `フォルダを処理中... (0/${currentBatchSize})`;

        try {
            const processingPromises = folderEntries.map(entry =>
                processDirectoryEntryRecursive(entry, entry.name, [])
                    .then(() => {
                        processedFolderCount++;
                        messageArea.textContent = `フォルダを処理中... (${processedFolderCount}/${currentBatchSize})`;
                    })
                    .catch(err => {
                        console.error(`Error processing folder ${entry.name}:`, err);
                    })
            );
            await Promise.allSettled(processingPromises);

            const finalMessage = processedFolderCount === currentBatchSize
                ? `フォルダの処理が完了しました。(${processedFolderCount}フォルダ)`
                : `フォルダ処理中に一部エラーが発生しました。(${processedFolderCount}/${currentBatchSize} フォルダ完了)`;
            messageArea.textContent = finalMessage;
            if (processedFolderCount !== currentBatchSize) {
                console.warn("Some folders failed to process completely.");
            }

        } catch (error) {
            console.error('フォルダ処理中に予期せぬエラー:', error);
            messageArea.textContent = 'エラーが発生しました。コンソールを確認してください。';
        } finally {
            console.log('Image Groups before rendering (drop):', JSON.stringify(Object.keys(imageGroups)));
            renderGrid();
            renderFolderList();
        }

    } else if (e.dataTransfer.files.length > 0 && folderEntries.length === 0) {
        messageArea.textContent = 'ファイルではなく、フォルダをドロップしてください。';
        renderFolderList();
    } else if (droppedFolders.size === 0) {
        messageArea.textContent = 'フォルダが見つかりませんでした。フォルダをドロップしてください。';
        renderFolderList();
    } else {
        messageArea.textContent = '新しいフォルダはありませんでした、または無効なアイテムです。';
        renderFolderList();
    }
}

async function handleFileInputChange(e) {
    const files = e.target.files;
    if (files.length === 0) return;

    messageArea.textContent = 'フォルダを処理中...';
    console.log("File input change event triggered");

    const foldersData = {};
    for (const file of files) {
        const pathParts = file.webkitRelativePath.split('/');
        if (pathParts.length > 1) {
            const folderName = pathParts[0];
            const relativePath = file.webkitRelativePath;
            if (!foldersData[folderName]) {
                foldersData[folderName] = { files: [], hasBeenProcessed: droppedFolders.has(folderName) };
            }
            if (!foldersData[folderName].hasBeenProcessed) {
                if (isImageFile(file) || isHtmlFile(file)) {
                    file.processedRelativePath = relativePath;
                    foldersData[folderName].files.push(file);
                }
            }
        }
    }

    const newFolderNames = Object.keys(foldersData).filter(name => !foldersData[name].hasBeenProcessed);

    if (newFolderNames.length > 0) {
        const currentBatchSize = newFolderNames.length;
        processedFolderCount = 0;
        clearButton.classList.remove('hidden');
        messageArea.textContent = `フォルダを処理中... (0/${currentBatchSize})`;

        try {
            const processingPromises = newFolderNames.map(folderName => {
                console.log(`Processing folder from input: ${folderName}`);
                droppedFolders.add(folderName);
                return processFilesFromInput(folderName, foldersData[folderName].files)
                    .then(() => {
                        processedFolderCount++;
                        messageArea.textContent = `フォルダを処理中... (${processedFolderCount}/${currentBatchSize})`;
                    })
                    .catch(err => {
                        console.error(`Error processing files from input folder ${folderName}:`, err);
                    });
            });
            await Promise.allSettled(processingPromises);

            const finalMessage = processedFolderCount === currentBatchSize
                ? `フォルダの処理が完了しました。(${processedFolderCount}フォルダ)`
                : `フォルダ処理中に一部エラーが発生しました。(${processedFolderCount}/${currentBatchSize} フォルダ完了)`;
            messageArea.textContent = finalMessage;
            if (processedFolderCount !== currentBatchSize) {
                console.warn("Some folders failed to process completely via input.");
            }

        } catch (error) {
            console.error('ファイル処理中にエラー:', error);
            messageArea.textContent = 'エラーが発生しました。コンソールを確認してください。';
        } finally {
            console.log('Image Groups before rendering (input):', JSON.stringify(Object.keys(imageGroups)));
            renderGrid();
            renderFolderList();
        }
    } else if (droppedFolders.size === 0) {
        messageArea.textContent = '有効な画像ファイルを含むフォルダが見つかりませんでした。';
        renderFolderList();
    } else {
        messageArea.textContent = '新しいフォルダはありませんでした。';
        renderFolderList();
    }
    fileInput.value = '';
}

function handleClear() {
    resetGrid();
    messageArea.textContent = '';
    clearButton.classList.add('hidden');
    processedFolderCount = 0;
    droppedFolders.clear();
    folderParameters = {}; // Clear parameters
    resetFilters(); // Reset filters as well
    gridParamsToggleContainer.classList.add('hidden'); // Hide grid params toggle
    toggleGridParamsCheckbox.checked = false; // Uncheck the box
    showGridParams = false; // Reset state variable
    renderFolderList();
    console.log("Grid cleared");
}

// --- UI描画関数 ---
function renderGrid() {
    console.log("Rendering grid...");
    gridContainer.innerHTML = '';

    // 1. Filter the folders based on selectedFolderName and currentFilters
    let folderNamesToDisplay = [];
    if (selectedFolderName && droppedFolders.has(selectedFolderName)) {
        // If a folder is selected, start with only that folder
        folderNamesToDisplay = [selectedFolderName];
    } else {
        // Otherwise, start with all dropped folders
        folderNamesToDisplay = Array.from(droppedFolders).sort();
    }

    // Apply parameter filters (currentFilters) to the folders determined above
    const filteredFolderNames = folderNamesToDisplay.filter(folderName => {
        const params = folderParameters[folderName];
        const seedFilterMatch = currentFilters.seed === '' || (params && params.seed !== undefined && String(params.seed).includes(currentFilters.seed));
        const personalityFilterMatch = currentFilters.personality === '' || (params && String(params.usePersonality) === currentFilters.personality);
        const memoryFilterMatch = currentFilters.memory === '' || (params && String(params.useMemory) === currentFilters.memory);
        const memoryLengthFilterMatch = currentFilters.memoryLength === '' ||
            (params && params.useMemory === true && params.memoryLength !== undefined && String(params.memoryLength) === currentFilters.memoryLength);
        return seedFilterMatch && personalityFilterMatch && memoryFilterMatch && memoryLengthFilterMatch;
    });
    const filteredFolderSet = new Set(filteredFolderNames); // For efficient lookup

    // 2. Get all filenames from imageGroups and sort them
    const allFilenames = Object.keys(imageGroups).sort();
    console.log("All filenames:", allFilenames);
    console.log("Filtered folders:", filteredFolderNames);

    let displayedGroupsCount = 0; // Track if any groups are displayed after filtering

    // 3. Iterate through sorted filenames and render groups if they contain images from filtered folders
    allFilenames.forEach(filename => {
        const originalGroup = imageGroups[filename];
        if (!originalGroup || originalGroup.length === 0) return;

        // Filter the items within the group based on the filtered folders
        const filteredGroup = originalGroup.filter(item => filteredFolderSet.has(item.folder));

        // Only render the group if it has images after filtering
        if (filteredGroup.length > 0) {
            displayedGroupsCount++;
            console.log(`Rendering filtered group for filename: ${filename}`, filteredGroup);

            // Determine if the group contains only HTML files
            const isHtmlOnlyGroup = filteredGroup.every(item => item.type === 'html');

            // Create container for header and toggle button
            const headerContainer = document.createElement('div');
            headerContainer.className = 'filename-header-container';

            const filenameHeader = document.createElement('h2');
            filenameHeader.className = 'filename-header cursor-pointer';
            filenameHeader.textContent = filename;
            filenameHeader.dataset.filename = filename;

            // Create toggle button - Set initial state based on content type
            const toggleButton = document.createElement('button');
            toggleButton.className = 'toggle-group-button';
            if (isHtmlOnlyGroup) {
                toggleButton.textContent = '+'; // Default to collapsed for HTML only
                toggleButton.dataset.expanded = 'false';
                toggleButton.setAttribute('aria-label', `グループ ${filename} を表示`);
                console.log(`Group ${filename} is HTML only, defaulting to collapsed.`);
            } else {
                toggleButton.textContent = '-'; // Default to expanded for others
                toggleButton.dataset.expanded = 'true';
                toggleButton.setAttribute('aria-label', `グループ ${filename} を隠す`);
            }
            toggleButton.dataset.filename = filename;

            headerContainer.appendChild(filenameHeader);
            headerContainer.appendChild(toggleButton);
            gridContainer.appendChild(headerContainer);

            const fileGrid = document.createElement('div');
            fileGrid.dataset.gridFilename = filename;
            // Adjust columns based on the *filtered* group length
            const numColumns = Math.min(filteredGroup.length, 6);
            fileGrid.className = `file-grid grid grid-cols-1 sm:grid-cols-2 md:grid-cols-${numColumns} gap-4`;

            // Add collapsed class if HTML only group
            if (isHtmlOnlyGroup) {
                fileGrid.classList.add('collapsed');
            }

            // Sort the filtered group for consistent display order
            const sortedFilteredGroup = filteredGroup.sort((a, b) => {
                const folderCompare = a.folder.localeCompare(b.folder);
                return folderCompare !== 0 ? folderCompare : a.relativePath.localeCompare(b.relativePath);
            });

            // IMPORTANT: Store the sorted filtered group for lightbox/fullscreen use
            // We'll use a temporary mapping for this render cycle
            if (!window.tempFilteredGroups) window.tempFilteredGroups = {};
            window.tempFilteredGroups[filename] = sortedFilteredGroup;

            sortedFilteredGroup.forEach((item, index) => {
                console.log(`Creating element for: ${item.folder}/${item.relativePath}, type: ${item.type}`);
                let itemContainer;

                if (item.type === 'image') {
                    itemContainer = document.createElement('div');
                    itemContainer.classList.add('grid-item-base', 'image-item');
                    itemContainer.dataset.filename = filename;
                    itemContainer.dataset.index = index;

                    const img = document.createElement('img');
                    img.src = item.dataUrl;
                    img.alt = `${item.relativePath}`;
                    img.onerror = () => {
                        console.error(`Error loading image: ${item.folder}/${item.relativePath}`);
                        img.src = `https://placehold.co/200x200/e5e7eb/9ca3af?text=LoadError`;
                        img.alt = `Error loading ${item.relativePath}`;
                    };
                    img.loading = 'lazy';
                    itemContainer.appendChild(img);

                } else if (item.type === 'html') {
                    itemContainer = document.createElement('a'); // Create anchor directly
                    itemContainer.classList.add('grid-item-base', 'html-item');
                    itemContainer.href = URL.createObjectURL(item.file);
                    itemContainer.target = '_blank';
                    itemContainer.rel = 'noopener noreferrer';

                    // Add filename text directly
                    const fileNameSpan = document.createElement('span');
                    fileNameSpan.className = 'html-filename';
                    fileNameSpan.textContent = `📄 ${item.file.name}`;
                    itemContainer.appendChild(fileNameSpan);

                    // Add parameter info as a tooltip (title attribute) to the container
                    const params = folderParameters[item.folder];
                    if (params) {
                        let paramParts = [];
                        if (params.seed !== undefined) {
                            paramParts.push(`Seed: ${params.seed}`);
                        }
                        paramParts.push(`Personality: ${params.usePersonality ? '✅' : '❌'}`);
                        let memoryPart = `Memory: ${params.useMemory ? '✅' : '❌'}`;
                        if (params.useMemory && params.memoryLength !== undefined) {
                            memoryPart += ` [Len: ${params.memoryLength}]`;
                        }
                        paramParts.push(memoryPart);
                        itemContainer.title = `Parameters (${item.folder}):\n${paramParts.join('\n')}`;
                    }
                }

                // Common setup for both types
                if (itemContainer) { // Ensure container was created
                    const infoDiv = document.createElement('div');
                    infoDiv.className = 'info';
                    const folderNamePara = document.createElement('p');
                    folderNamePara.className = 'folder-name';
                    folderNamePara.textContent = item.folder;
                    infoDiv.appendChild(folderNamePara);

                    // パラメータ表示切り替え (共通)
                    if (showGridParams) {
                        const params = folderParameters[item.folder];
                        if (params) {
                            const paramsPara = document.createElement('p');
                            paramsPara.className = 'grid-item-params text-xs text-gray-500 mt-1';
                            let paramParts = [];
                            if (params.seed !== undefined) paramParts.push(`S: ${params.seed}`);
                            paramParts.push(`P: ${params.usePersonality ? '✅' : '❌'}`);
                            let memoryPart = `M: ${params.useMemory ? '✅' : '❌'}`;
                            if (params.useMemory && params.memoryLength !== undefined) memoryPart += ` [L: ${params.memoryLength}]`;
                            paramParts.push(memoryPart);
                            paramsPara.textContent = paramParts.join(' / ');
                            infoDiv.appendChild(paramsPara);
                        }
                    }

                    itemContainer.appendChild(infoDiv);
                    fileGrid.appendChild(itemContainer);
                }
            });
            gridContainer.appendChild(fileGrid);
        }
    });

    // 4. Display message if no groups are shown after filtering
    if (displayedGroupsCount === 0 && droppedFolders.size > 0) {
        let message = "フィルターに一致する画像グループはありません。";
        if (selectedFolderName) {
            message += ` (フォルダ '${selectedFolderName}' 内)`;
        }
        message += " フィルター条件を変更するか、フォルダの選択を解除してください。";
        gridContainer.innerHTML = `<p class="text-gray-500 text-center">${message}</p>`;
    } else if (droppedFolders.size === 0) {
        // Keep grid empty if no folders were ever dropped
        gridContainer.innerHTML = '';
    }

    console.log("Grid rendering complete with filters applied.");
}

/**
 * Toggles the visibility of an image group grid.
 * @param {string} filename - The filename group to toggle.
 * @param {HTMLElement} buttonElement - The button that was clicked.
 */
function toggleGroupVisibility(filename, buttonElement) {
    const fileGrid = gridContainer.querySelector(`[data-grid-filename="${filename}"]`);
    if (!fileGrid) {
        console.error(`Could not find grid for filename: ${filename}`);
        return;
    }

    const isExpanded = buttonElement.dataset.expanded === 'true';

    if (isExpanded) {
        fileGrid.classList.add('collapsed');
        buttonElement.textContent = '+';
        buttonElement.dataset.expanded = 'false';
        buttonElement.setAttribute('aria-label', `グループ ${filename} を表示`);
        console.log(`Collapsed group: ${filename}`);
    } else {
        fileGrid.classList.remove('collapsed');
        buttonElement.textContent = '-';
        buttonElement.dataset.expanded = 'true';
        buttonElement.setAttribute('aria-label', `グループ ${filename} を隠す`);
        console.log(`Expanded group: ${filename}`);
    }
}

function resetGrid() {
    imageGroups = {};
    gridContainer.innerHTML = '';
}

/**
 * Resets the filter inputs and state, then re-renders the list.
 */
function resetFilters() {
    filterSeedInput.value = '';
    filterPersonalitySelect.value = '';
    filterMemorySelect.value = '';
    filterMemoryLengthInput.value = ''; // 追加
    currentFilters = { seed: '', personality: '', memory: '', memoryLength: '' }; // memoryLength を追加
    selectedFolderName = null; // Reset selected folder as well
    console.log("Filters and folder selection reset");
    renderFolderList(); // Re-render with no filters/selection
    renderGrid(); // Re-render grid with no filters/selection
}

/**
 * Renders the list of processed folders, applying current filters.
 */
function renderFolderList() {
    folderList.innerHTML = '';

    if (droppedFolders.size === 0) {
        folderListSection.classList.add('hidden');
        folderFilterControls.classList.add('hidden'); // Hide filter controls
        clearButton.classList.add('hidden');
        toggleFolderListButton.classList.add('hidden'); // Hide toggle button when no folders
        folderList.classList.add('folder-list-collapsed'); // Ensure list is collapsed when empty
        toggleFolderListButton.textContent = '[+]'; // Reset button text
        toggleFolderListButton.setAttribute('aria-label', 'フォルダ一覧を全表示');
        gridParamsToggleContainer.classList.add('hidden'); // Hide grid params toggle
        return;
    }

    folderListSection.classList.remove('hidden');
    folderFilterControls.classList.remove('hidden'); // Show filter controls
    clearButton.classList.remove('hidden');
    toggleFolderListButton.classList.remove('hidden'); // Show toggle button when folders exist
    gridParamsToggleContainer.classList.remove('hidden'); // Show grid params toggle

    const sortedFolderNames = Array.from(droppedFolders).sort();

    // Apply filters
    const filteredFolderNames = sortedFolderNames.filter(folderName => {
        const params = folderParameters[folderName];

        // SEED filter (matches if input is empty or seed includes the input string)
        const seedFilterMatch = currentFilters.seed === '' || (params && params.seed !== undefined && String(params.seed).includes(currentFilters.seed));

        // Personality filter (matches if filter is empty, or param exists and matches boolean value)
        const personalityFilterMatch = currentFilters.personality === '' || (params && String(params.usePersonality) === currentFilters.personality);

        // Memory filter (matches if filter is empty, or param exists and matches boolean value)
        const memoryFilterMatch = currentFilters.memory === '' || (params && String(params.useMemory) === currentFilters.memory);

        // Memory Length filter (追加)
        // - フィルター入力が空なら常に true
        // - 入力がある場合:
        //   - params が存在し、useMemory が true であること
        //   - params.memoryLength が存在し、フィルター入力値と一致すること (文字列比較)
        const memoryLengthFilterMatch = currentFilters.memoryLength === '' ||
            (params && params.useMemory === true && params.memoryLength !== undefined && String(params.memoryLength) === currentFilters.memoryLength);


        return seedFilterMatch && personalityFilterMatch && memoryFilterMatch && memoryLengthFilterMatch; // memoryLengthFilterMatch を追加
    });

    if (filteredFolderNames.length === 0 && sortedFolderNames.length > 0) {
        // Show message if filters result in no matches, but folders exist
        const li = document.createElement('li');
        li.textContent = 'フィルターに一致するフォルダはありません。';
        li.className = 'text-gray-500 italic';
        folderList.appendChild(li);
    } else {
        filteredFolderNames.forEach(folderName => {
            const li = document.createElement('li');
            // Add selected class if this folder is the selected one
            if (folderName === selectedFolderName) {
                li.classList.add('selected-folder');
            }

            const nameContainer = document.createElement('span');
            nameContainer.className = 'folder-name-container';
            nameContainer.textContent = folderName;
            nameContainer.dataset.folderName = folderName; // Add data attribute

            const paramsContainer = document.createElement('span');
            paramsContainer.className = 'folder-params';

            const params = folderParameters[folderName];
            if (params) {
            // Seed パラメータ
            const seedSpan = document.createElement('span');
            seedSpan.className = 'param-part seed-param';
            if (params.seed !== undefined) {
                seedSpan.textContent = `Seed: ${params.seed}`;
            } else {
                seedSpan.innerHTML = '&nbsp;'; // Seedがない場合はスペースで位置を合わせる
            }
            paramsContainer.appendChild(seedSpan);

            // Personality パラメータ
            const personaSpan = document.createElement('span');
            personaSpan.className = 'param-part persona-param';
            personaSpan.textContent = `P: ${params.usePersonality ? '✅' : '❌'}`;
            paramsContainer.appendChild(personaSpan);

            // Memory パラメータ
            const memorySpan = document.createElement('span');
            memorySpan.className = 'param-part memory-param';
            memorySpan.textContent = `M: ${params.useMemory ? '✅' : '❌'}`;
            paramsContainer.appendChild(memorySpan);

            // Memory Length パラメータ (修正: 表示名を Len に、表示条件を調整)
            const LengthSpan = document.createElement('span');
            LengthSpan.className = 'param-part length-param';
            // useMemory が true で memoryLength が定義されている場合のみ表示、それ以外は '-'
            LengthSpan.textContent = `Len: ${params.useMemory && params.memoryLength !== undefined ? params.memoryLength : '-'}`;
            paramsContainer.appendChild(LengthSpan);


            } else {
            // パラメータファイルがない場合
            // レイアウト維持のため、空のspanを追加
            const seedSpan = document.createElement('span'); seedSpan.className = 'param-part seed-param'; seedSpan.innerHTML = '&nbsp;'; paramsContainer.appendChild(seedSpan);
            const personaSpan = document.createElement('span'); personaSpan.className = 'param-part persona-param'; personaSpan.innerHTML = '&nbsp;'; paramsContainer.appendChild(personaSpan);
            const memorySpan = document.createElement('span'); memorySpan.className = 'param-part memory-param'; memorySpan.innerHTML = '&nbsp;'; paramsContainer.appendChild(memorySpan);
            const lengthSpan = document.createElement('span'); lengthSpan.className = 'param-part length-param'; lengthSpan.innerHTML = '&nbsp;'; paramsContainer.appendChild(lengthSpan); // Length 用も追加
            }

            const deleteButton = document.createElement('button');
            deleteButton.className = 'delete-folder-button';
            deleteButton.textContent = '削除';
            deleteButton.dataset.folderName = folderName;
            deleteButton.setAttribute('aria-label', `${folderName} フォルダを削除`);

            li.appendChild(nameContainer);
            li.appendChild(paramsContainer);
            li.appendChild(deleteButton);
            folderList.appendChild(li);
        });
    }

    console.log("Folder list rendered with filters:", currentFilters);
    console.log("Displayed folders:", filteredFolderNames);
}

/**
 * Removes a specific folder and its images/parameters.
 * @param {string} folderName - The name of the folder to remove.
 */
function removeFolder(folderName) {
    if (!droppedFolders.has(folderName)) {
        console.warn(`Attempted to remove non-existent folder: ${folderName}`);
        return;
    }

    console.log(`Removing folder: ${folderName}`);

    // 1. Remove from droppedFolders Set
    droppedFolders.delete(folderName);

    // 2. Remove from folderParameters
    delete folderParameters[folderName];

    // 3. Remove images associated with this folder from imageGroups
    const filenamesToDelete = [];
    for (const filename in imageGroups) {
        imageGroups[filename] = imageGroups[filename].filter(item => item.folder !== folderName);
        if (imageGroups[filename].length === 0) {
            filenamesToDelete.push(filename);
        }
    }

    filenamesToDelete.forEach(filename => {
        delete imageGroups[filename];
        console.log(`Removed empty image group: ${filename}`);
    });

    // If the removed folder was the selected one, reset selection
    if (selectedFolderName === folderName) {
        selectedFolderName = null;
        console.log("Selected folder was removed, resetting selection.");
    }

    // Re-render the grid and folder list which will apply filters
    renderGrid();
    renderFolderList();

    messageArea.textContent = `${folderName} フォルダを削除しました。`;
    console.log(`Folder ${folderName} removed. Remaining folders:`, Array.from(droppedFolders));
    console.log('Updated imageGroups:', JSON.stringify(Object.keys(imageGroups)));
    console.log('Updated folderParameters:', folderParameters);
}

// --- ライトボックス関数 ---

function openLightbox(filename, index) {
    // Use the temporarily stored filtered group for the lightbox
    const groupToShow = window.tempFilteredGroups ? window.tempFilteredGroups[filename] : null;

    if (!groupToShow || index < 0 || index >= groupToShow.length) {
        console.error("Invalid filename or index for lightbox (using filtered group):", filename, index, groupToShow);
        // Fallback or error handling - maybe try original group?
        // For now, just log and return
        return;
    }

    // No need to re-sort, it was sorted in renderGrid
    currentLightboxGroup = groupToShow;
    currentLightboxIndex = index;
    console.log(`Opening lightbox for filtered group: ${filename}, index: ${index}`);

    updateLightboxContent();

    lightbox.classList.add('show');
    document.body.classList.add('lightbox-open');
    document.addEventListener('keydown', handleLightboxKeys);
}

function updateLightboxContent() {
    if (currentLightboxIndex < 0 || currentLightboxIndex >= currentLightboxGroup.length) {
        console.error("Invalid index in updateLightboxContent:", currentLightboxIndex);
        closeLightbox();
        return;
    }

    const item = currentLightboxGroup[currentLightboxIndex];
    lightboxImg.src = item.dataUrl;
    lightboxImg.alt = item.relativePath;

    // Display folder name and parameters
    const folderNameElement = lightboxInfo.querySelector('.folder-name');
    let folderDisplayText = item.folder;
    const params = folderParameters[item.folder];
    if (params) {
        let paramParts = [];
        if (params.seed !== undefined) {
            paramParts.push(`Seed: ${params.seed}`);
        }
        paramParts.push(`Persona: ${params.usePersonality ? '✅' : '❌'}`);
        let memoryPart = `Memory: ${params.useMemory ? '✅' : '❌'}`;
        if (params.useMemory && params.memoryLength !== undefined) {
            memoryPart += ` [Len: ${params.memoryLength}]`;
        }
        paramParts.push(memoryPart);
        folderDisplayText += ` (${paramParts.join(', ')})`; // Append parameters
    }
    folderNameElement.textContent = folderDisplayText;


    // Display relative path
    const pathParts = item.relativePath.split('/');
    const displayPath = pathParts.length > 1 ? pathParts.slice(1).join('/') : '(ルート)';
    lightboxInfo.querySelector('.relative-path').textContent = displayPath;

    lightboxPrev.disabled = currentLightboxIndex === 0;
    lightboxNext.disabled = currentLightboxIndex === currentLightboxGroup.length - 1;
    console.log(`Lightbox updated to index: ${currentLightboxIndex}`);
}

function closeLightbox() {
    lightbox.classList.remove('show');
    document.body.classList.remove('lightbox-open');
    document.removeEventListener('keydown', handleLightboxKeys);
    currentLightboxGroup = [];
    currentLightboxIndex = -1;
    console.log("Lightbox closed");
}

function showPrevImage() {
    if (currentLightboxIndex > 0) {
        currentLightboxIndex--;
        updateLightboxContent();
    }
}

function showNextImage() {
    if (currentLightboxIndex < currentLightboxGroup.length - 1) {
        currentLightboxIndex++;
        updateLightboxContent();
    }
}

function handleLightboxKeys(e) {
    if (e.key === 'ArrowLeft') {
        showPrevImage();
    } else if (e.key === 'ArrowRight') {
        showNextImage();
    } else if (e.key === 'Escape') {
        closeLightbox();
    }
}

// --- フルスクリーンビュー関数 ---

/**
 * Opens the fullscreen view for a specific filename group and enables sorting.
 * @param {string} filename - The filename group to display.
 */
function openFullScreenView(filename) {
    // Use the temporarily stored filtered group for the fullscreen view
    const groupToShow = window.tempFilteredGroups ? window.tempFilteredGroups[filename] : null;

    if (!groupToShow || groupToShow.length === 0) {
        console.warn(`No images found for fullscreen view (using filtered group): ${filename}`);
        return;
    }
    console.log(`Opening fullscreen view for filtered group: ${filename}`);

    fullscreenGrid.innerHTML = ''; // Clear previous content

    // No need to re-sort, it was sorted in renderGrid
    const sortedGroup = groupToShow;

    // Populate the fullscreen grid
    sortedGroup.forEach((item, index) => {
        let itemContainer;

        if (item.type === 'image') {
            itemContainer = document.createElement('div');
            itemContainer.classList.add('grid-item-base', 'image-item');
            itemContainer.dataset.filename = filename;
            itemContainer.dataset.index = index;

            const img = document.createElement('img');
            img.src = item.dataUrl;
            img.alt = `${item.relativePath}`;
            img.onerror = () => {
                console.error(`Error loading image in fullscreen: ${item.folder}/${item.relativePath}`);
                img.src = `https://placehold.co/400x350/e5e7eb/9ca3af?text=LoadError`; // Adjusted placeholder size
                img.alt = `Error loading ${item.relativePath}`;
            };
            img.loading = 'lazy';
            itemContainer.appendChild(img);
        } else if (item.type === 'html') {
            itemContainer = document.createElement('a'); // Create anchor directly
            itemContainer.classList.add('grid-item-base', 'html-item');
            itemContainer.href = URL.createObjectURL(item.file);
            itemContainer.target = '_blank';
            itemContainer.rel = 'noopener noreferrer';

            // Add filename text directly
            const fileNameSpan = document.createElement('span');
            fileNameSpan.className = 'html-filename';
            fileNameSpan.textContent = `📄 ${item.file.name}`;
            itemContainer.appendChild(fileNameSpan);
        }

        // Common setup
        if (itemContainer) {
            const infoDiv = document.createElement('div');
            infoDiv.className = 'info';
            const folderNamePara = document.createElement('p');
            folderNamePara.className = 'folder-name';
            folderNamePara.textContent = item.folder;
            infoDiv.appendChild(folderNamePara);

            // フルスクリーンでもパラメータ表示切り替えを適用
            if (showGridParams) {
                const params = folderParameters[item.folder];
                if (params) {
                    const paramsPara = document.createElement('p');
                    paramsPara.className = 'grid-item-params fullscreen-item-params text-sm text-gray-600 mt-1';
                    let paramParts = [];
                    if (params.seed !== undefined) paramParts.push(`Seed: ${params.seed}`);
                    paramParts.push(`P: ${params.usePersonality ? '✅' : '❌'}`);
                    let memoryPart = `M: ${params.useMemory ? '✅' : '❌'}`;
                    if (params.useMemory && params.memoryLength !== undefined) memoryPart += ` [Len: ${params.memoryLength}]`;
                    paramParts.push(memoryPart);
                    paramsPara.textContent = paramParts.join(', ');
                    infoDiv.appendChild(paramsPara);
                }
            }

            itemContainer.appendChild(infoDiv);
            fullscreenGrid.appendChild(itemContainer);
        }
    });

    // Initialize SortableJS on the fullscreen grid
    if (typeof Sortable !== 'undefined') {
        // Destroy previous instance if exists
        if (currentSortableInstance) {
            currentSortableInstance.destroy();
        }
        currentSortableInstance = new Sortable(fullscreenGrid, {
            animation: 150, // ms, animation speed moving items when sorting, `0` — without animation
            ghostClass: 'sortable-ghost', // Class name for the drop placeholder
            chosenClass: 'sortable-chosen', // Class name for the chosen item
            // Note: This sorting only affects the DOM within fullscreen view,
            // it does not update the underlying imageGroups data or the filtered data.
            onEnd: function (/**Event*/evt) {
                // Optional: If you need to update the lightbox index after sorting
                // you might need to re-map the indices here, but it adds complexity.
                // For now, sorting is purely visual within fullscreen.
                console.log('Sort ended. Item moved from', evt.oldIndex, 'to', evt.newIndex);
            },
        });
        console.log("SortableJS initialized for fullscreen view.");
    } else {
        console.warn("SortableJS library not found. Drag-and-drop reordering disabled.");
    }

    fullscreenView.classList.add('show');
    document.body.classList.add('fullscreen-open'); // Lock body scroll
}

/**
 * Closes the fullscreen view and destroys the SortableJS instance.
 */
function closeFullScreenView() {
    fullscreenView.classList.remove('show');
    document.body.classList.remove('fullscreen-open'); // Unlock body scroll

    // Destroy the Sortable instance if it exists
    if (currentSortableInstance) {
        currentSortableInstance.destroy();
        currentSortableInstance = null;
        console.log("SortableJS instance destroyed.");
    }

    console.log("Fullscreen view closed");
}

// --- 初期化 ---
renderFolderList();
// Initial state check for toggle button visibility is handled within renderFolderList now

// --- ファイル/フォルダ処理関数の実装 ---

async function processDirectoryEntryRecursive(directoryEntry, topLevelFolderName, currentPathParts) {
    console.log(`Processing directory: ${directoryEntry.name} at path: ${currentPathParts.join('/')}`);
    const reader = directoryEntry.createReader();
    const fileProcessingPromises = [];

    return new Promise((resolve, reject) => {
        reader.readEntries(async (entries) => {
            for (const entry of entries) {
                const newPathParts = [...currentPathParts, entry.name];
                if (entry.isFile) {
                    fileProcessingPromises.push(processFileEntry(entry, topLevelFolderName, newPathParts.join('/')));
                } else if (entry.isDirectory) {
                    fileProcessingPromises.push(
                        processDirectoryEntryRecursive(entry, topLevelFolderName, newPathParts)
                    );
                }
            }
            try {
                await Promise.all(fileProcessingPromises);
                resolve();
            } catch (error) {
                console.error(`Error processing entries in ${directoryEntry.fullPath || directoryEntry.name}:`, error);
                reject(error);
            }
        }, (error) => {
            console.error(`フォルダ読み取りエラー (${directoryEntry.name}):`, error);
            reject(error);
        });
    });
}

async function processFileEntry(fileEntry, folderName, relativePath) {
    console.log(`Processing file entry: ${fileEntry.name} in folder: ${folderName}, path: ${relativePath}`);
    return new Promise((resolve, reject) => {
        fileEntry.file(async (file) => {
            const filename = file.name;
            const fullRelativePath = `${folderName}/${relativePath}`;

            // Check if it's parameters.json at the top level
            if (filename === 'parameters.json' && relativePath === 'parameters.json') {
                console.log(`Found parameters.json for folder: ${folderName}`);
                try {
                    const content = await file.text();
                    const params = JSON.parse(content);
                    folderParameters[folderName] = {
                        usePersonality: params.USE_PERSONALITY ?? false, // Default to false if undefined
                        useMemory: params.USE_MEMORY ?? false, // Default to false if undefined
                        memoryLength: params.MEMORY_LENGTH, // Keep undefined if not present
                        seed: params.SEED // Add SEED value
                    };
                    console.log(`Parsed parameters for ${folderName}:`, folderParameters[folderName]);
                    resolve(); // Parameter file processed
                } catch (error) {
                    console.error(`Error reading or parsing parameters.json for ${folderName}:`, error);
                    reject(error); // Reject on parameter processing error
                }
            } else if (isImageFile(file)) { // Process image files
                try {
                    const dataUrl = await readFileAsDataURL(file);
                    console.log(`Read image file: ${relativePath}`);
                    if (!imageGroups[filename]) imageGroups[filename] = [];
                    if (!imageGroups[filename].some(item => item.folder === folderName && item.relativePath === relativePath)) {
                        imageGroups[filename].push({
                            folder: folderName,
                            relativePath: relativePath,
                            file: file, // Keep file object if needed later
                            dataUrl: dataUrl,
                            type: 'image' // Add type identifier
                        });
                        console.log(`Added image to imageGroups: ${filename} from ${fullRelativePath}`);
                    } else {
                        console.log(`Skipping duplicate image: ${filename} from ${fullRelativePath}`);
                    }
                    resolve();
                } catch (error) {
                    console.error(`ファイル読み込みエラー (${filename}):`, error);
                    reject(error);
                }
            } else if (isHtmlFile(file)) { // Process HTML files
                console.log(`Found HTML file: ${relativePath}`);
                if (!imageGroups[filename]) imageGroups[filename] = [];
                // Store HTML file info (without dataUrl)
                if (!imageGroups[filename].some(item => item.folder === folderName && item.relativePath === relativePath)) {
                    imageGroups[filename].push({
                        folder: folderName,
                        relativePath: relativePath,
                        file: file, // Store the file object to create URL later
                        type: 'html' // Add type identifier
                    });
                    console.log(`Added HTML file to imageGroups: ${filename} from ${fullRelativePath}`);
                } else {
                    console.log(`Skipping duplicate HTML file: ${filename} from ${fullRelativePath}`);
                }
                resolve();
            } else {
                // Not an image, HTML, or parameters.json
                resolve();
            }
        }, (error) => {
            console.error(`Fileオブジェクト取得エラー (${fileEntry.name}):`, error);
            reject(error);
        });
    });
}

async function processFilesFromInput(folderName, files) {
    const processingPromises = [];
    let paramsFound = false;

    // First pass: Find and process parameters.json
    const paramFile = files.find(file => file.webkitRelativePath === `${folderName}/parameters.json`);
    if (paramFile) {
        console.log(`Found parameters.json for folder via input: ${folderName}`);
        processingPromises.push((async () => {
            try {
                const content = await paramFile.text();
                const params = JSON.parse(content);
                folderParameters[folderName] = {
                    usePersonality: params.USE_PERSONALITY ?? false,
                    useMemory: params.USE_MEMORY ?? false,
                    memoryLength: params.MEMORY_LENGTH,
                    seed: params.SEED // Add SEED value
                };
                console.log(`Parsed parameters for ${folderName} (input):`, folderParameters[folderName]);
                paramsFound = true;
            } catch (error) {
                console.error(`Error reading or parsing parameters.json for ${folderName} (input):`, error);
                // Decide if this should halt processing for the folder or just log
            }
        })());
    }

    // Wait for parameter processing if found
    if (paramFile) {
        await Promise.allSettled(processingPromises);
        processingPromises.length = 0; // Clear promises array for image processing
    }

    // Second pass: Process image and HTML files
    for (const file of files) {
        const filename = file.name;
        const relativePath = file.webkitRelativePath;

        // Skip the parameters file itself
        if (relativePath === `${folderName}/parameters.json`) {
            continue;
        }

        if (isImageFile(file)) {
            processingPromises.push((async () => {
                try {
                    const dataUrl = await readFileAsDataURL(file);
                    console.log(`Read image file from input: ${relativePath}`);
                    if (!imageGroups[filename]) imageGroups[filename] = [];
                    if (!imageGroups[filename].some(item => item.folder === folderName && item.relativePath === relativePath)) {
                        imageGroups[filename].push({
                            folder: folderName,
                            relativePath: relativePath,
                            file: file,
                            dataUrl: dataUrl,
                            type: 'image' // Add type
                        });
                        console.log(`Added image to imageGroups: ${filename} from ${relativePath}`);
                    } else {
                        console.log(`Skipping duplicate image: ${filename} from ${relativePath}`);
                    }
                } catch (error) {
                    console.error(`ファイル読み込みエラー (${filename}):`, error);
                }
            })());
        } else if (isHtmlFile(file)) {
             processingPromises.push((async () => {
                console.log(`Found HTML file from input: ${relativePath}`);
                if (!imageGroups[filename]) imageGroups[filename] = [];
                if (!imageGroups[filename].some(item => item.folder === folderName && item.relativePath === relativePath)) {
                    imageGroups[filename].push({
                        folder: folderName,
                        relativePath: relativePath,
                        file: file,
                        type: 'html' // Add type
                    });
                    console.log(`Added HTML file to imageGroups: ${filename} from ${relativePath}`);
                } else {
                    console.log(`Skipping duplicate HTML file: ${filename} from ${relativePath}`);
                }
            })());
        }
    }
    await Promise.allSettled(processingPromises);
}

function isImageFile(file) { return file.type.startsWith('image/'); }

// 追加: HTMLファイル判定関数
function isHtmlFile(file) {
    return file.type === 'text/html' || file.name.toLowerCase().endsWith('.html') || file.name.toLowerCase().endsWith('.htm');
}

function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => { console.error("FileReader error:", reader.error); reject(reader.error); };
        reader.readAsDataURL(file);
    });
}