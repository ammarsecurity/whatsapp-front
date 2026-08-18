function splitMessage(text, size = 900) {
    const parts = [];

    let start = 0;
    while (start < text.length) {
        parts.push(text.substring(start, start + size));
        start += size;
    }

    return parts;
}

module.exports = splitMessage;
