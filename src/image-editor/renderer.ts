import { Cursor, Rect } from "./models";

const maxSnapshots = 50;

export class Renderer {
    private undoStack: ImageData[] = [];
    private redoStack: ImageData[] = [];
    private currentSnapshot: ImageData | undefined;

    private backgroundLayer: HTMLCanvasElement;
    private baseImageLayer: HTMLCanvasElement;
    private refImageLayer: HTMLCanvasElement;
    private editLayer: HTMLCanvasElement;
    private overlayLayer: HTMLCanvasElement;

    private _overlayImageOpacity: number = 1;
    private _referenceImageOpacity: number = 0.3;

    public get overlayImageOpacity(): number {
        return this._overlayImageOpacity;
    }

    public set overlayImageOpacity(opacity: number) {
        this._overlayImageOpacity = opacity;
        this.render();
    }

    public get referenceImageOpacity(): number {
        return this._referenceImageOpacity;
    }

    public set referenceImageOpacity(opacity: number) {
        this._referenceImageOpacity = opacity;
        this.render();
    }

    private selectionOverlay: Rect | undefined;
    private hasSelection: boolean = false;
    private cursor: Cursor | undefined;

    private zoom: number;
    private offsetX: number;
    private offsetY: number;
    private width = 0;
    private height = 0;
    private _renderReferenceImages = true;

    private snapshotListeners: (() => void)[];

    private referenceImages: HTMLCanvasElement[] = [];

    get renderReferenceImages(): boolean {
        return this._renderReferenceImages;
    }

    set renderReferenceImages(render: boolean) {
        this._renderReferenceImages = render;
        this.render();
    }

    addReferenceImage(image: HTMLImageElement | HTMLCanvasElement) {
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d");
        if (context) {
            context.drawImage(image, 0, 0);
            this.referenceImages.push(canvas);
            this.render();
        }
    }

    removeReferenceImage(index: number) {
        this.referenceImages.splice(index, 1);
        this.render();
    }

    referencImageCount(): number {
        return this.referenceImages.length;
    }

    getEncodedReferenceImages(): string[] {
        return this.referenceImages.map(image => {
            const context = image.getContext("2d");
            if (context) {
                return this.imageDataToEncodedImage(context.getImageData(0, 0, image.width, image.height), "webp")!;
            }
            return "";
        });
    }

    getReferenceImages(): HTMLCanvasElement[] {
        return [...this.referenceImages];
    }

    constructor(private readonly canvas: HTMLCanvasElement) {
        // invisible canvas elements
        this.backgroundLayer = document.createElement("canvas");
        this.backgroundLayer.width = canvas.width;
        this.backgroundLayer.height = canvas.height;
        this.baseImageLayer = document.createElement("canvas");
        this.refImageLayer = document.createElement("canvas");
        this.editLayer = document.createElement("canvas");
        this.overlayLayer = document.createElement("canvas");
        this.snapshotListeners = [];

        this.zoom = 1;
        this.offsetX = 0;
        this.offsetY = 0;
    }

    updateCanvasSize(width: number, height: number) {
        this.canvas.width = width;
        this.canvas.height = height;
        this.backgroundLayer.width = width;
        this.backgroundLayer.height = height;
        this.initializeBackgroundLayer();
        this.render();
    }

    undo(allowRedo: boolean = true) {
        if (this.undoStack.length > 0 && this.currentSnapshot) {
            const imageData = this.undoStack.pop()!;
            if (allowRedo) {
                this.redoStack.push(this.currentSnapshot);
            }
            this.currentSnapshot = imageData;
            // set as base image
            const ctx = this.baseImageLayer.getContext("2d");
            if (ctx) {
                ctx.clearRect(
                    0,
                    0,
                    this.baseImageLayer.width,
                    this.baseImageLayer.height
                );
                ctx.putImageData(imageData, 0, 0);
                this.render();
            }
            this.notifySnapshotListeners();
        }
    }

    redo() {
        if (this.redoStack.length > 0 && this.currentSnapshot) {
            this.undoStack.push(this.currentSnapshot);
            const imageData = this.redoStack.pop()!;
            this.currentSnapshot = imageData;

            // set as base image
            const ctx = this.baseImageLayer.getContext("2d");
            if (ctx) {
                ctx.putImageData(imageData, 0, 0);
                this.render();
            }
            this.notifySnapshotListeners();
        }
    }

    clearRedoStack() {
        this.redoStack = [];
        this.notifySnapshotListeners();
    }

    canUndo(): boolean {
        return !this.hasSelection && this.undoStack.length > 0;
    }

    canRedo(): boolean {
        return !this.hasSelection && this.redoStack.length > 0;
    }

    addSnapshotListener(listener: () => void) {
        this.snapshotListeners.push(listener);
    }

    removeSnapshotListener(listener: () => void) {
        this.snapshotListeners = this.snapshotListeners.filter(
            l => l !== listener
        );
    }

    snapshot() {
        const ctx = this.baseImageLayer.getContext("2d");
        if (ctx) {
            const snapshot = ctx.getImageData(
                0,
                0,
                this.baseImageLayer.width,
                this.baseImageLayer.height
            );
            if (this.currentSnapshot) {
                this.undoStack.push(this.currentSnapshot);
                this.currentSnapshot = snapshot;
                if (this.redoStack.length > 0) {
                    this.redoStack = [];
                }
                if (this.undoStack.length > maxSnapshots) {
                    this.undoStack.shift();
                }
            } else {
                this.currentSnapshot = snapshot;
            }

            this.notifySnapshotListeners();
        }
    }

    private notifySnapshotListeners() {
        for (let listener of this.snapshotListeners) {
            listener();
        }
    }

    render() {
        const context = this.canvas.getContext("2d");
        if (context) {
            context.globalAlpha = 1;
            context.clearRect(0, 0, this.width, this.height);
            context.drawImage(this.backgroundLayer, 0, 0);
            // apply zoom and offset
            context.setTransform(
                this.zoom,
                0,
                0,
                this.zoom,
                this.offsetX * this.zoom,
                this.offsetY * this.zoom
            );
            // context.drawImage(this.backgroundLayer, 0, 0);
            context.drawImage(this.baseImageLayer, 0, 0);
            context.globalAlpha = this.referenceImageOpacity;
            context.drawImage(this.refImageLayer, 0, 0);
            // set opacity back to 1
            context.globalAlpha = 1;
            context.drawImage(this.editLayer, 0, 0);

            context.globalAlpha = this.overlayImageOpacity;
            context.drawImage(this.overlayLayer, 0, 0);
            this.drawOverlay(context, this.width, this.height);
            context.setTransform(1, 0, 0, 1, 0, 0);
        }
    }

    getCanvas(): HTMLCanvasElement {
        return this.canvas;
    }

    private initializeBackgroundLayer() {
        // checkered background
        // #DEDEDE
        // #FFFFFF
        // 10x10 pixel squares
        const ctx = this.backgroundLayer.getContext("2d");
        if (ctx) {
            const pattern = ctx.createPattern(
                this.createCheckeredPattern(20, 20, "#808080", "#AAAAAA"),
                "repeat"
            );
            if (pattern) {
                ctx.fillStyle = pattern;
                ctx.fillRect(
                    0,
                    0,
                    this.backgroundLayer.width,
                    this.backgroundLayer.height
                );
            }
        }
    }

    private createCheckeredPattern(
        width: number,
        height: number,
        color1: string,
        color2: string
    ): HTMLCanvasElement {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
            ctx.fillStyle = color1;
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = color2;
            ctx.fillRect(0, 0, width / 2, height / 2);
            ctx.fillRect(width / 2, height / 2, width / 2, height / 2);
        }
        return canvas;
    }

    setReferenceImage(image: HTMLImageElement | HTMLCanvasElement) {
        const context = this.refImageLayer.getContext("2d");
        if (context) {
            // clear the reference image layer
            context.clearRect(
                0,
                0,
                this.refImageLayer.width,
                this.refImageLayer.height
            );
            // draw the reference image
            context.drawImage(image, 0, 0, this.refImageLayer.width, this.refImageLayer.height);
            this.render();
        }
    }

    clearReferenceImage() {
        const context = this.refImageLayer.getContext("2d");
        if (context) {
            context.clearRect(
                0,
                0,
                this.refImageLayer.width,
                this.refImageLayer.height
            );
            this.render();
        }
    }

    setOverlayImage(image: HTMLImageElement | HTMLCanvasElement) {
        const context = this.overlayLayer.getContext("2d");
        if (context) {
            context.clearRect(
                0,
                0,
                this.overlayLayer.width,
                this.overlayLayer.height
            );
            context.drawImage(image, 0, 0, this.overlayLayer.width, this.overlayLayer.height);
            this.render();
        }
    }

    clearOverlayImage() {
        const context = this.overlayLayer.getContext("2d");
        if (context) {
            context.clearRect(
                0,
                0,
                this.overlayLayer.width,
                this.overlayLayer.height
            );
            this.render();
        }
    }

    getReferenceImageColor(x: number, y: number): string {
        const context = this.refImageLayer.getContext("2d");
        if (context) {
            const pixel = context.getImageData(x, y, 1, 1).data;
            return `rgba(${pixel[0]}, ${pixel[1]}, ${pixel[2]}, ${pixel[3]})`;
        }
        return "rgba(0, 0, 0, 0)";
    }

    setBaseImage(
        image: HTMLImageElement | HTMLCanvasElement,
        updateSelectionOverlay = true
    ) {
        const context = this.baseImageLayer.getContext("2d");
        if (context) {
            // set size of all layers
            // TODO: adapt for an always-square canvas
            this.initializeBackgroundLayer();

            this.baseImageLayer.width = image.width;
            this.baseImageLayer.height = image.height;
            this.refImageLayer.width = image.width;
            this.refImageLayer.height = image.height;
            this.editLayer.width = image.width;
            this.editLayer.height = image.height;
            this.overlayLayer.width = image.width;
            this.overlayLayer.height = image.height;
            // set image size
            this.width = image.width;
            this.height = image.height;
            // this.canvas.width = image.width;
            // this.canvas.height = image.height;
            context.drawImage(image, 0, 0);

            if (updateSelectionOverlay) {
                // set 1024x1024 selection overlay at the center of the image
                this.setSelectionOverlay({
                    x: (image.width - 1024) / 2,
                    y: (image.height - 1024) / 2,
                    width: 1024,
                    height: 1024,
                });
            }
            this.resetView();
            // this.render(); // already called by updateZoomAndOffset
            this.snapshot();
        }
    }

    resetView() {
        // Determine the aspect ratios of the image and canvas
        const imageAspectRatio = this.width / this.height;
        const canvasAspectRatio = this.canvas.width / this.canvas.height;

        let zoom, offsetX, offsetY;

        if (imageAspectRatio > canvasAspectRatio) {
            // The image is wider than the canvas, so we should fit the image to the width of the canvas
            zoom = this.canvas.width / this.width;
            offsetX = 0;
            // Calculate the amount of empty space in the height (in image coordinate space), and divide by 2 to center
            offsetY = (this.height - (this.canvas.height / zoom)) / -2;
        } else {
            // The image is taller or equal aspect ratio to the canvas, so we should fit the image to the height of the canvas
            zoom = this.canvas.height / this.height;
            offsetY = 0;
            // Calculate the amount of empty space in the width (in image coordinate space), and divide by 2 to center
            offsetX = (this.width - (this.canvas.width / zoom)) / -2;
        }

        this.updateZoomAndOffset(zoom, offsetX, offsetY);
    }



    setEditImage(imageData: ImageData | null) {
        this.hasSelection = !!imageData;
        const context = this.editLayer.getContext("2d");
        if (context && this.selectionOverlay) {
            context.clearRect(
                0,
                0,
                this.editLayer.width,
                this.editLayer.height
            );
            if (imageData) {
                context.putImageData(
                    imageData,
                    this.selectionOverlay.x,
                    this.selectionOverlay.y
                );
            }
            // edit image makes the selection rect and preview disappear
            // so redraw the overlay
            this.hasSelection = !!imageData;
            this.render();
        }
        this.notifySnapshotListeners();
    }

    private drawOverlay(
        context: CanvasRenderingContext2D,
        width: number,
        height: number
    ) {
        const lineWidth = Math.max(this.width / 512, this.height / 512);
        if (context) {
            
            context.strokeStyle = "white";
            context.lineWidth = lineWidth;
            context.strokeRect(0, 0, width, height);
            if (this.cursor) {
                if (this.cursor.type === "circle") {
                    context.lineWidth = lineWidth;
                    context.strokeStyle = this.cursor.color;
                    // context.globalAlpha = 0.5;
                    context.beginPath();
                    context.arc(
                        this.cursor.x,
                        this.cursor.y,
                        this.cursor.radius,
                        0,
                        2 * Math.PI
                    );
                    context.stroke();
                } else if (this.cursor.type === "circle-fill") {
                    context.fillStyle = this.cursor.color;
                    context.strokeStyle = this.cursor.color;
                    // context.lineWidth = lineWidth;
                    // context.globalAlpha = 0.5;
                    context.beginPath();
                    context.arc(
                        this.cursor.x,
                        this.cursor.y,
                        this.cursor.radius,
                        0,
                        2 * Math.PI
                    );
                    context.stroke();
                    // set alpha to 0.5 and fill
                    context.globalAlpha = 0.5;
                    context.beginPath();
                    context.arc(
                        this.cursor.x,
                        this.cursor.y,
                        this.cursor.radius,
                        0,
                        2 * Math.PI
                    );
                    context.fill();
                    context.globalAlpha = 1;
                } else if (this.cursor.type == "crosshairs") {
                    // draw crosshairs based on cursor radius
                    context.strokeStyle = this.cursor.color;
                    context.lineWidth = lineWidth;
                    context.beginPath();
                    context.moveTo(
                        this.cursor.x - this.cursor.radius,
                        this.cursor.y
                    );
                    context.lineTo(
                        this.cursor.x + this.cursor.radius,
                        this.cursor.y
                    );
                    context.moveTo(
                        this.cursor.x,
                        this.cursor.y - this.cursor.radius
                    );
                    context.lineTo(
                        this.cursor.x,
                        this.cursor.y + this.cursor.radius
                    );
                    context.stroke();
                } else if (this.cursor.type === "colorpicker") {
                    // TODO: add croshairs
                    context.lineWidth = this.cursor.radius * 0.75;
                    context.strokeStyle = this.cursor.color;
                    // context.globalAlpha = 0.5;
                    context.beginPath();
                    context.arc(
                        this.cursor.x,
                        this.cursor.y,
                        this.cursor.radius,
                        0,
                        2 * Math.PI
                    );
                    context.stroke();

                    // draw crosshairs (black)
                    context.lineWidth = lineWidth;
                    context.strokeStyle = "black";
                    context.beginPath();
                    context.moveTo(
                        this.cursor.x - this.cursor.radius,
                        this.cursor.y
                    );
                    context.lineTo(
                        this.cursor.x + this.cursor.radius,
                        this.cursor.y
                    );
                    context.moveTo(
                        this.cursor.x,
                        this.cursor.y - this.cursor.radius
                    );
                    context.lineTo(
                        this.cursor.x,
                        this.cursor.y + this.cursor.radius
                    );
                    context.stroke();
                }
            }
        }
    }

    setSelectionOverlay(selectionOverlay: Rect | undefined) {
        this.selectionOverlay = selectionOverlay;
        this.render();
    }

    setCursor(cursor: Cursor | undefined) {
        this.cursor = cursor;
        this.render();
    }

    getSelectionOverlay(): Rect | undefined {
        return this.selectionOverlay;
    }

    getZoom(): number {
        return this.zoom;
    }

    getOffsetX(): number {
        return this.offsetX;
    }

    getOffsetY(): number {
        return this.offsetY;
    }

    updateZoomAndOffset(zoom: number, offsetX: number, offsetY: number) {
        // console.log(`zoom: ${zoom}, offset: ${offsetX}, ${offsetY}`)
        this.zoom = zoom;
        this.offsetX = offsetX;
        this.offsetY = offsetY;
        this.render();
    }

    getWidth(): number {
        return this.width;
    }

    getHeight(): number {
        return this.height;
    }

    private imageDataToEncodedImage(imageData: ImageData, format: "png" | "webp" | "jpeg"): string | undefined {
        // create a canvas and draw the image data on it
        const canvas = document.createElement("canvas");
        canvas.width = imageData.width;
        canvas.height = imageData.height;
        const context = canvas.getContext("2d");
        if (context) {
            context.putImageData(imageData, 0, 0);
            // return the data url of the canvas
            const result = canvas.toDataURL(`image/${format}`);
            // cleanup the canvas
            canvas.remove();
            // extract base64 data from data url
            return result.split(",")[1];
        }
    }

    private encodedImageToImageData(encodedImage: string, format: "png" | "webp" | "jpeg"): Promise<ImageData> {
        // create a canvas and draw the image data on it
        const canvas = document.createElement("canvas");
        canvas.width = this.width;
        canvas.height = this.height;
        const context = canvas.getContext("2d");
        if (context) {
            const image = new Image();
            image.src = `data:image/${format};base64,${encodedImage}`;
            return new Promise(resolve => {
                image.onload = () => {
                    context.drawImage(image, 0, 0);
                    // return the image data
                    resolve(context.getImageData(0, 0, this.width, this.height));
                }
            });
        }
        throw new Error("Could not create canvas context");
    }

    getEncodedImage(selection: Rect | null, format: "png" | "webp" | "jpeg", includeOverlay: boolean = false): string | undefined {
        const imageData = this.getImageData(selection, includeOverlay);
        if (imageData) {
            return this.imageDataToEncodedImage(imageData, format);
        }
    }

    private convertMaskToErasure(erasure: ImageData): ImageData {
        // for each pixel, if alpha < 255, set to white, otherwise set to black
        const mask = erasure;
        for (let i = 0; i < erasure.data.length; i += 4) {
            // let white = erasure.data[i + 3] < 255;
            let white = erasure.data[i] === 255;
            if (white) {
                mask.data[i] = 255;
                mask.data[i + 1] = 255;
                mask.data[i + 2] = 255;
                mask.data[i + 3] = 0;
            } else {
                mask.data[i] = 0;
                mask.data[i + 1] = 0;
                mask.data[i + 2] = 0;
                mask.data[i + 3] = 255;
            }
        }
        return mask;
    }

    private convertErasureToMask(mask: ImageData): ImageData {
        // for each pixel, if alpha < 255, set to white, otherwise set to black
        const erasure = mask;
        for (let i = 0; i < mask.data.length; i += 4) {
            let white = mask.data[i + 3] < 255;
            if (white) {
                erasure.data[i] = 255;
                erasure.data[i + 1] = 255;
                erasure.data[i + 2] = 255;
                erasure.data[i + 3] = 255;
            } else {
                erasure.data[i] = 0;
                erasure.data[i + 1] = 0;
                erasure.data[i + 2] = 0;
                erasure.data[i + 3] = 255;
            }
        }
        return erasure;
    }

    getImageData(
        selection: Rect | null,
        includeOverlay: boolean = false
    ): ImageData | undefined {
        if (!selection) {
            selection = {
                x: 0,
                y: 0,
                width: this.width,
                height: this.height,
            };
        }
        // get image data of the selection
        const imageLayer = this.baseImageLayer;
        if (!imageLayer) {
            return;
        }
        const overlayLayer = this.overlayLayer;
        if (!overlayLayer) {
            return;
        }
        // create a temporary canvas to draw the image data and overlay
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = selection.width;
        tempCanvas.height = selection.height;
        const context = tempCanvas.getContext("2d");
        if (context) {
            context.drawImage(
                imageLayer,
                selection.x,
                selection.y,
                selection.width,
                selection.height,
                0,
                0,
                selection.width,
                selection.height
            );
            if (includeOverlay) {
                context.globalAlpha = this.overlayImageOpacity;
                context.drawImage(
                    overlayLayer,
                    selection.x,
                    selection.y,
                    selection.width,
                    selection.height,
                    0,
                    0,
                    selection.width,
                    selection.height
                );
            }
            return context.getImageData(0, 0, selection.width, selection.height);
        }
    }

    commitSelection() {
        // This Rube Goldberg machine of a function is necessary because of a browser bug
        // introduced some time in 2023. It uses a temporary canvas to properly blend the
        // edit layer with the base image layer - for some reason if I don't, the base image
        // layer gets completely overwritten by the edit layer. I can't seem to reproduce the
        // issue outside this codebase, so there is the workaround.
        const context = this.baseImageLayer.getContext("2d");
        if (context) {
            // Create a temporary canvas
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = this.baseImageLayer.width;
            tempCanvas.height = this.baseImageLayer.height;
            const tempContext = tempCanvas.getContext("2d");

            // Ensure the temporary context is valid
            if (tempContext) {
                // Draw the base image layer on the temporary canvas
                tempContext.drawImage(this.baseImageLayer, 0, 0);

                // Draw the edit layer on top of the base image in the temporary canvas
                tempContext.drawImage(this.editLayer, 0, 0);

                // Now draw the combined image from the temporary canvas back onto the base image layer
                context.drawImage(tempCanvas, 0, 0);
            }

            this.setEditImage(null);
            this.snapshot();
        }
    }


    drawPoint(
        x: number,
        y: number,
        brushSize: number,
        color: string,
    ): void {
        // draw on selection layer
        const imageLayer = this.editLayer;
        if (!imageLayer) {
            return;
        }
        const context = imageLayer.getContext("2d");
        if (context) {
            context.fillStyle = color;
            context.beginPath();
            context.arc(x, y, brushSize / 2, 0, 2 * Math.PI);
            context.fill();
        }
        this.render();
    }

    erasePoint(brushx: number, brushy: number, brushSize: number): void {
        if (!this.selectionOverlay) {
            throw new Error("No selection overlay");
        }
        // get image data centered on x, y with brushSize width and height
        const context = this.baseImageLayer.getContext("2d");
        if (context) {
            const imageData = context.getImageData(
                brushx - brushSize / 2,
                brushy - brushSize / 2,
                brushSize,
                brushSize
            );
            // set alpha to 0 in a circle centered on x, y with radius brushSize / 2
            for (let i = 0; i < imageData.data.length; i += 4) {
                const x = (i / 4) % brushSize;
                const y = Math.floor(i / 4 / brushSize);

                const absx = x - brushSize / 2 + brushx;
                // three pixel barrier on each edge UNLESS the selection overlay borders that edge
                let leftEdge = this.selectionOverlay.x;
                if (leftEdge > 0) {
                    leftEdge += 10;
                }
                let rightEdge =
                    this.selectionOverlay.x + this.selectionOverlay.width;
                if (rightEdge < this.width) {
                    rightEdge -= 10;
                }
                let topEdge = this.selectionOverlay.y;
                if (topEdge > 0) {
                    topEdge += 10;
                }
                let bottomEdge =
                    this.selectionOverlay.y + this.selectionOverlay.height;
                if (bottomEdge < this.canvas.height) {
                    bottomEdge -= 10;
                }

                const containsx = absx > leftEdge && absx < rightEdge;
                const absy = y - brushSize / 2 + brushy;
                const containsy = absy > topEdge && absy < bottomEdge;
                const contains = containsx && containsy;

                // check if x, y is within the selection overlay
                if (this.selectionOverlay && !contains) {
                    continue;
                }

                const distance = Math.sqrt(
                    Math.pow(x - brushSize / 2, 2) +
                    Math.pow(y - brushSize / 2, 2)
                );
                if (distance < brushSize / 2) {
                    imageData.data[i + 3] = 0;
                }
            }
            // draw the image data on the selection layer
            context.putImageData(
                imageData,
                brushx - brushSize / 2,
                brushy - brushSize / 2
            );
        }
    }

    drawLine(
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        brushSize: number,
        color: string,
    ): void {
        const imageLayer = this.editLayer;
        if (!imageLayer) {
            return;
        }
        // draw on selection layer
        const context = imageLayer.getContext("2d");
        if (context) {
            context.strokeStyle = color;
            context.lineWidth = brushSize;
            context.lineCap = "round";
            context.beginPath();
            context.moveTo(x1, y1);
            context.lineTo(x2, y2);
            context.stroke();
        }
        this.render();
    }

    smudgeLine(
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        brushSize: number,
        brushOpacity: number
    ): void {
        const unitVector = {
            x: x2 - x1,
            y: y2 - y1,
        };
        const length = Math.sqrt(
            unitVector.x * unitVector.x + unitVector.y * unitVector.y
        );
        unitVector.x /= length;
        unitVector.y /= length;

        // for each point on the line, get image data (brushSize x brushSize) from edit layer
        // average pixel values that are within the brush circle.
        // update the image data with the averaged pixel values in the
        // brush circle, then put the image data back on the edit layer
        // at the point on the line

        const context = this.editLayer.getContext("2d");
        if (context) {
            for (let i = 0; i < length; i++) {
                const x = x1 + i * unitVector.x;
                const y = y1 + i * unitVector.y;

                const imageData = context.getImageData(
                    x - brushSize / 2,
                    y - brushSize / 2,
                    brushSize,
                    brushSize
                );

                let totalRed = 0;
                let totalGreen = 0;
                let totalBlue = 0;
                let count = 0.0;

                // average pixel values
                for (let y = 0; y < imageData.height; y++) {
                    for (let x = 0; x < imageData.width; x++) {
                        const index = (y * imageData.width + x) * 4;
                        const distance = Math.sqrt(
                            (x - brushSize / 2) * (x - brushSize / 2) +
                            (y - brushSize / 2) * (y - brushSize / 2)
                        );
                        if (distance <= brushSize / 2) {
                            // get the pixel value from the image data
                            const r = imageData.data[index];
                            const g = imageData.data[index + 1];
                            const b = imageData.data[index + 2];

                            totalRed += r;
                            totalGreen += g;
                            totalBlue += b;
                            count++;
                        }
                    }
                }

                // update the image data with the averaged pixel values
                // these need to be weighted by the brush opacity
                const averageRed = totalRed / count;
                const averageGreen = totalGreen / count;
                const averageBlue = totalBlue / count;
                for (let y = 0; y < imageData.height; y++) {
                    for (let x = 0; x < imageData.width; x++) {
                        const index = (y * imageData.width + x) * 4;
                        const distance = Math.sqrt(
                            (x - brushSize / 2) * (x - brushSize / 2) +
                            (y - brushSize / 2) * (y - brushSize / 2)
                        );
                        if (distance <= brushSize / 2) {
                            imageData.data[index] =
                                averageRed * brushOpacity +
                                imageData.data[index] * (1 - brushOpacity);
                            imageData.data[index + 1] =
                                averageGreen * brushOpacity +
                                imageData.data[index + 1] * (1 - brushOpacity);
                            imageData.data[index + 2] =
                                averageBlue * brushOpacity +
                                imageData.data[index + 2] * (1 - brushOpacity);
                        }
                    }
                }

                // put the image data back on the edit layer
                context.putImageData(
                    imageData,
                    x - brushSize / 2,
                    y - brushSize / 2
                );
            }
        }
        this.render();
    }

    getPixel(x: number, y: number): string {
        const context = this.baseImageLayer.getContext("2d");
        // get pixel as hex string
        if (context) {
            const pixel = context.getImageData(x, y, 1, 1).data;
            return (
                "#" +
                ("000000" + rgbToHex(pixel[0], pixel[1], pixel[2])).slice(-6)
            );
        }
        return "#000000";
    }

    copyEditImageFromBaseImage(): void {
        // copy the base image to the edit layer
        const context = this.editLayer.getContext("2d");
        if (context) {
            context.drawImage(this.baseImageLayer, 0, 0);
        }
        this.render();
        this.hasSelection = true;
        this.notifySnapshotListeners();
    }

    expandToOverlay() {
        if (!this.selectionOverlay) {
            throw new Error("No selection overlay");
        }
        const minX = Math.min(0, this.selectionOverlay.x);
        const minY = Math.min(0, this.selectionOverlay.y);
        const maxX = Math.max(
            this.selectionOverlay.x + this.selectionOverlay.width,
            this.baseImageLayer.width
        );
        const maxY = Math.max(
            this.selectionOverlay.y + this.selectionOverlay.height,
            this.baseImageLayer.height
        );
        const width = maxX - minX;
        const height = maxY - minY;

        // create a new canvas with the expanded size
        const newCanvas = document.createElement("canvas");
        newCanvas.width = width;
        newCanvas.height = height;
        // draw the base image on the new canvas.
        // if overlay.x is negative, image.x is overlay.x * -1
        // if overlay.x is 0 or positive, image.x is 0
        // if overlay.y is negative, image.y is overlay.y * -1
        // if overlay.y is 0 or positive, image.y is 0
        const context = newCanvas.getContext("2d");
        if (context) {
            context.drawImage(
                this.baseImageLayer,
                Math.max(0, this.selectionOverlay.x * -1),
                Math.max(0, this.selectionOverlay.y * -1)
            );
        }
        if (this.selectionOverlay.x < 0) {
            this.selectionOverlay.x = 0;
        }
        if (this.selectionOverlay.y < 0) {
            this.selectionOverlay.y = 0;
        }
        console.log(`new Canvas size: ${width} x ${height}`);
        this.setBaseImage(newCanvas, false);
    }
}

function rgbToHex(r: number, g: number, b: number) {
    if (r > 255 || g > 255 || b > 255) throw "Invalid color component";
    return ((r << 16) | (g << 8) | b).toString(16);
}

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
    return new Renderer(canvas);
}
