class LEDPanel {
    static #ledOff = '#444444';
    static #height = 8;
    leds = [];
    
    constructor(el, width, ledWidth, ledHeight) {
        this.svg = SVG(el).clear().size(ledWidth*width, ledHeight*LEDPanel.#height).css({ 'background-color': '#000' });
        this.width = width;

        for (let row = 0; row < LEDPanel.#height; ++row) {
            this.leds.push([]);
            for (let col = 0; col < width; ++col) {
                this.leds[row].push(this.svg.ellipse(ledWidth, ledHeight).fill(LEDPanel.#ledOff).move(ledWidth*col, ledHeight*row));
            }
        }
    }

    clearAll() {
        clearInterval(this.timer);
        for (let row = 0; row < LEDPanel.#height; ++row) {
            this.clearRow(row);
        }
    }

    clearRow(row) {
        this.leds[row].forEach(led => led.fill(LEDPanel.#ledOff));
    }

    drawRow(i, data, color) {
        for (let j = 0; j < data.length; ++j) {
            this.leds[i][j].fill(data[j] === '1' ? color : LEDPanel.#ledOff);
        }
    }

    drawMatrix(data, color) {
        for (let i = 0; i < data.length; ++i) {
            this.drawRow(i, data[i], color);
        }
    }

    drawCentered(bitmap, color) {
        const offset = (this.width - bitmap.width()) / 2;
        bitmap.crop(this.width, bitmap.height(), -offset);
        this.drawMatrix(bitmap.todata(), color);
    }

    drawLoop(bitmap, color, offset) {
        offset %= bitmap.width();
        const leftWidth = Math.min(bitmap.width()-offset, this.width);
        const newBitmap = bitmap.clone().crop(leftWidth, bitmap.height(), offset);
        if (newBitmap.width() < this.width) {
            newBitmap.concat(bitmap.clone().crop(this.width-leftWidth, bitmap.height()));
        }
        this.drawMatrix(newBitmap.todata(), color);
    }

    drawLoopable(font, text, color, interval) {
        clearInterval(this.timer);
        const bitmap = font.draw(text);
        if (text.length * font.headers.fbbx > this.width) {
            let offset = 0;
            bitmap.crop(bitmap.width()+font.headers.fbbx, bitmap.height());
            this.timer = setInterval(() => this.drawLoop(bitmap, color, offset++), interval);
        } else {
            this.drawCentered(bitmap, color);
        }
    }

    async drawScroll(font, text, color, interval) {
        clearInterval(this.timer);
        const bitmap = font.draw(text);
        for (let offset = -this.width; offset <= bitmap.width(); ++offset) {
            const newBitmap = bitmap.clone().crop(this.width, bitmap.height(), offset);
            this.drawMatrix(newBitmap.todata(), color);
            await new Promise(cb => setTimeout(cb, interval));
        }
    }

    async drawAndClearVertical(font, text, color, interval) {
        clearInterval(this.timer);
        const bitmap = font.draw(text);
        const offset = (this.width - bitmap.width()) / 2;
        bitmap.crop(this.width, bitmap.height(), -offset);
        for (let row = 0; row < LEDPanel.#height; ++row) {
            const rowBitmap = bitmap.clone().crop(bitmap.width(), 1, 0, LEDPanel.#height-row-1);
            this.drawRow(row, rowBitmap.todata(0), color);
            await new Promise(cb => setTimeout(cb, interval));
        }
        for (let row = 0; row < LEDPanel.#height; ++row) {
            await new Promise(cb => setTimeout(cb, interval));
            this.clearRow(row);
        }
    }
}
