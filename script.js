
const voiceLanguages = {
    English: "en-IN",
    Telugu: "te-IN",
    Hindi: "hi-IN",
    Tamil: "ta-IN",
    Kannada: "kn-IN",
    Malayalam: "ml-IN",
    Bengali: "bn-IN",
    Marathi: "mr-IN",
    Gujarati: "gu-IN",
    Punjabi: "pa-IN",
    Urdu: "ur-PK",
    Spanish: "es-ES",
    French: "fr-FR"
};

let products = [];
let recognition = null;

function createLanguageDropdown() {
    let select = document.getElementById("voiceLanguage");

    if (!select) {
        select = document.createElement("select");
        select.id = "voiceLanguage";

        Object.entries(voiceLanguages).forEach(([name, code]) => {
            const option = document.createElement("option");
            option.value = code;
            option.textContent = name;
            select.appendChild(option);
        });

        const label = document.createElement("label");
        label.textContent = "Select Language: ";
        label.appendChild(select);
        document.body.prepend(label);
    }

    return select;
}

async function loadProducts() {
    const message = document.getElementById("message");

    try {
        const response = await fetch("./products.csv");

        if (!response.ok) {
            throw new Error("CSV file not found");
        }

        const csvText = await response.text();
        products = parseCSV(csvText);

        if (message) {
            message.textContent = "Products loaded successfully.";
        }
    } catch (error) {
        console.error(error);

        if (message) {
            message.textContent =
                "Cannot load products.csv. Please use Live Server.";
        }
    }
}

function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = "";
    let quotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const next = text[i + 1];

        if (char === '"' && quotes && next === '"') {
            field += '"';
            i++;
        } else if (char === '"') {
            quotes = !quotes;
        } else if (char === "," && !quotes) {
            row.push(field.trim());
            field = "";
        } else if ((char === "\n" || char === "\r") && !quotes) {
            if (char === "\r" && next === "\n") i++;

            row.push(field.trim());

            if (row.some(value => value !== "")) {
                rows.push(row);
            }

            row = [];
            field = "";
        } else {
            field += char;
        }
    }

    row.push(field.trim());

    if (row.some(value => value !== "")) {
        rows.push(row);
    }

    if (rows.length < 2) return [];

    const headers = rows[0].map(h => h.trim().toLowerCase());

    return rows.slice(1).map(values => {
        const product = {};

        headers.forEach((header, index) => {
            product[header] = values[index] || "";
        });

        return product;
    });
}

function normalizeText(text) {
    return String(text || "")
        .toLowerCase()
        .normalize("NFKC")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function productBaseName(name) {
    return normalizeText(name)
        .replace(
            /\b\d+(?:\.\d+)?\s*(?:kg|g|gm|mg|ml|l|ltr|litre|liter|pack|pcs|pc)\b/gi,
            " "
        )
        .replace(/\s+/g, " ")
        .trim();
}

function detectLanguage(text) {
    if (/[\u0C00-\u0C7F]/.test(text)) return "te";
    if (/[\u0900-\u097F]/.test(text)) return "hi";
    if (/[\u0B80-\u0BFF]/.test(text)) return "ta";
    if (/[\u0C80-\u0CFF]/.test(text)) return "kn";
    if (/[\u0D00-\u0D7F]/.test(text)) return "ml";
    if (/[\u0980-\u09FF]/.test(text)) return "bn";
    if (/[\u0A80-\u0AFF]/.test(text)) return "gu";
    if (/[\u0A00-\u0A7F]/.test(text)) return "pa";
    if (/[\u0600-\u06FF]/.test(text)) return "ur";
    return "en";
}

async function translateText(text, from, to) {
    if (from === to) return text;

    try {
        const url =
            "https://api.mymemory.translated.net/get?q=" +
            encodeURIComponent(text) +
            "&langpair=" + from + "|" + to;

        const response = await fetch(url);
        const data = await response.json();

        if (
            data.responseStatus === 200 &&
            data.responseData &&
            data.responseData.translatedText
        ) {
            return data.responseData.translatedText;
        }
    } catch (error) {
        console.error("Translation failed:", error);
    }

    return text;
}

async function translateToEnglish(text) {
    return translateText(text, detectLanguage(text), "en");
}

async function translateMessage(text, targetLanguage) {
    const targetCode = targetLanguage.split("-")[0];
    return translateText(text, "en", targetCode);
}

function speakResult(message) {
    if (!("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel();

    const select = document.getElementById("voiceLanguage");
    const language = select ? select.value : "en-IN";

    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = language;
    utterance.rate = 0.9;
    utterance.pitch = 1;

    const voices = window.speechSynthesis.getVoices();

    const voice = voices.find(v =>
        v.lang.toLowerCase() === language.toLowerCase()
    ) || voices.find(v =>
        v.lang.toLowerCase().startsWith(
            language.split("-")[0].toLowerCase()
        )
    );

    if (voice) utterance.voice = voice;

    window.speechSynthesis.speak(utterance);
}

async function speakProductResult(message) {
    const select = document.getElementById("voiceLanguage");
    const language = select ? select.value : "en-IN";

    const translated = await translateMessage(message, language);
    speakResult(translated);
}

function cleanProductQuery(text) {
    return normalizeText(text)
        .replace(
            /\b(where is|where are|find|show me|locate|location of|please|tell me|i want|search for|search|item|product|in dmart|in d mart)\b/g,
            " "
        )
        .replace(/\s+/g, " ")
        .trim();
}

function findProduct(query) {
    const q = cleanProductQuery(query);

    if (!q) return { type: "notfound" };

    const exact = products.filter(p =>
        normalizeText(p.name) === q ||
        normalizeText(p.id) === q
    );

    if (exact.length === 1) {
        return { type: "found", product: exact[0] };
    }

    if (exact.length > 1) {
        return { type: "multiple", products: exact };
    }

    const base = products.filter(p =>
        productBaseName(p.name) === q
    );

    if (base.length === 1) {
        return { type: "found", product: base[0] };
    }

    if (base.length > 1) {
        return { type: "multiple", products: base };
    }

    const partial = products.filter(p => {
        const name = normalizeText(p.name);
        const baseName = productBaseName(p.name);

        return name.includes(q) || baseName.includes(q);
    });

    if (partial.length === 1) {
        return { type: "found", product: partial[0] };
    }

    if (partial.length > 1) {
        return { type: "multiple", products: partial };
    }

    return { type: "notfound" };
}

function displayProduct(product) {
    const result = document.getElementById("result");
    const message = document.getElementById("message");

    const spokenMessage =
        product.name + " is located on Floor " +
        (product.floor || "not specified") +
        ", Row " + (product.row || "not specified") +
        ", Shelf " + (product.shelf || "not specified") +
        ". Price: " + (product.price || "not specified") + ".";

    if (result) result.textContent = spokenMessage;
    if (message) message.textContent = "Product found!";

    speakProductResult(spokenMessage);
}

function showProductChoices(matches) {
    const result = document.getElementById("result");
    const message = document.getElementById("message");

    if (result) result.replaceChildren();

    if (message) {
        message.textContent = "Select the correct product:";
    }

    matches.forEach(product => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = product.name;
        button.addEventListener("click", () => displayProduct(product));

        if (result) result.appendChild(button);
    });
}

async function searchProduct(inputText) {
    const message = document.getElementById("message");
    const result = document.getElementById("result");
    const text = String(inputText || "").trim();

    if (!text) {
        if (message) message.textContent = "Enter a product name.";
        return;
    }

    if (products.length === 0) await loadProducts();

    let match = findProduct(text);

    if (match.type === "notfound") {
        const translated = await translateToEnglish(text);

        if (normalizeText(translated) !== normalizeText(text)) {
            match = findProduct(translated);
        }
    }

    if (match.type === "found") {
        displayProduct(match.product);
    } else if (match.type === "multiple") {
        showProductChoices(match.products);
    } else {
        if (message) message.textContent = "Product not found. Try again.";
        if (result) result.replaceChildren();
    }
}

function startVoiceAssistant() {
    const SpeechRecognition =
        window.SpeechRecognition ||
        window.webkitSpeechRecognition;

    const message = document.getElementById("message");
    const input = document.getElementById("product");

    if (!SpeechRecognition) {
        if (message) {
            message.textContent =
                "Voice recognition is unavailable. Try Google Chrome.";
        }
        return;
    }

    stopVoiceAssistant();

    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;

    const select = document.getElementById("voiceLanguage");
    recognition.lang = select ? select.value : "en-IN";

    recognition.onstart = () => {
        if (message) message.textContent = "Listening...";
    };

    recognition.onresult = async event => {
        const spokenText = event.results[0][0].transcript;

        if (input) input.value = spokenText;

        await searchProduct(spokenText);
    };

    recognition.onerror = event => {
        console.error(event.error);
        if (message) {
            message.textContent = "Speech recognition failed. Try again.";
        }
    };

    recognition.onend = () => {
        recognition = null;
    };

    recognition.start();
}

function stopVoiceAssistant() {
    if (recognition) {
        recognition.onend = null;

        try {
            recognition.stop();
        } catch (error) {
            console.log(error);
        }

        recognition = null;
    }
}

document.addEventListener("DOMContentLoaded", () => {
    createLanguageDropdown();

    const searchButton = document.getElementById("searchButton");
    const voiceButton = document.getElementById("voiceButton");
    const stopButton = document.getElementById("stopButton");
    const input = document.getElementById("product");

    if (searchButton) {
        searchButton.addEventListener("click", () => {
            searchProduct(input ? input.value : "");
        });
    }

    if (input) {
        input.addEventListener("keydown", event => {
            if (event.key === "Enter") {
                searchProduct(input.value);
            }
        });
    }

    if (voiceButton) {
        voiceButton.addEventListener("click", startVoiceAssistant);
    }

    if (stopButton) {
        stopButton.addEventListener("click", stopVoiceAssistant);
    }

    loadProducts();

    if ("speechSynthesis" in window) {
        window.speechSynthesis.getVoices();
        window.speechSynthesis.onvoiceschanged = () => {
            window.speechSynthesis.getVoices();
        };
    }
});
