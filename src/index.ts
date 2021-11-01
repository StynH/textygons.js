//@ts-ignore
import * as VectorizeText from "vectorize-text";
import _, {floor, isNaN} from "lodash";

enum State{
    DISPLAYING,
    LOADING,
    TRANSFORMING
}

type Dimensions = {
    width: number;
    height: number;
}

type Canvas = {
    element: HTMLCanvasElement,
    context: CanvasRenderingContext2D,
    width: number,
    height: number
}

type TextString = {
    text: string;
    width?: number | null;
    height?: number | null;
    font?: string | null;
}

type Options = {
    canvasId: string;
    textOffsetX: number;
    textOffsetY: number;
    strings: TextString[];
    pointColor: string;
    edgeColor: string;
    backgroundColor: string;
    edgeFadeTime: number;
    defaultFont: string;
    textHoldTime: number;
    maxSpacing: number;
    pointSize: number;
    fps: number;
}

type DisplayableText = {
    text: string;
    edges: Edge[];
    points: Point[]
}

type RGB = {
    r: number;
    g: number;
    b: number;
}

class DeltaTime{
    lastUpdate: number;
    deltaTime: number;

    constructor() {
        this.lastUpdate = Date.now();
        this.deltaTime = 0;
    }

    update(): void{
        const now = Date.now();
        this.deltaTime = now - this.lastUpdate;
        this.lastUpdate = now;
    }
}

class Point{
    public x: number;
    public y: number;
    public destinationPoint: Point  | undefined;

    constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
    }

    public add(toAdd: Point): Point{
        return new Point(this.x + toAdd.x, this.y + toAdd.y);
    }

    public subtract(toAdd: Point): Point{
        return new Point(this.x - toAdd.x, this.y - toAdd.y);
    }

    public product(value: number): Point{
        return new Point(this.x * value, this.y * value);
    }

    public divide(value: number): Point{
        return new Point(this.x / value, this.y / value);
    }

    public moveTowardsDestination(stepSize: number): void{
        if(this.destinationPoint != undefined){
            const vector = new Point(this.destinationPoint.x - this.x, this.destinationPoint.y - this.y);
            const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
            const unitVector = new Point(vector.x / length, vector.y / length);
            this.x = this.x + unitVector.x * stepSize;
            this.y = this.y + unitVector.y * stepSize;

            if(Math.abs(this.x - this.destinationPoint.x) < 1 && Math.abs(this.y - this.destinationPoint.y) < 1){
                this.x = this.destinationPoint.x;
                this.y = this.destinationPoint.y;
                this.destinationPoint = undefined;
            }
        }
    }

    public isValid(): boolean{
        return !(isNaN(this.x) || isNaN(this.y))
    }

    public copy(): Point {
        return new Point(this.x, this.y);
    }

    public isAtDestinationPoint() {
        if(this.destinationPoint == undefined) return true;
        return this.x == this.destinationPoint.x && this.y == this.destinationPoint.y;
    }
}

class Edge{
    public start: Point;
    public end: Point;
    public color: string;

    private startColor: string;
    private endColor: string;
    private stepSize: number;
    private stepsDone: number;

    constructor(start: Point, end: Point) {
        this.start = start;
        this.end = end;
        this.color = "#FFF";

        this.startColor = "#FFF"
        this.endColor = "#FFF";
        this.stepSize = 0;
        this.stepsDone = 0;
    }

    public setFadeColor(start: string, end: string, stepSize: number): void{
        this.startColor = start;
        this.endColor = end;
        this.stepSize = stepSize;
    }

    public fadeColor(): void{
        if(this.color != this.endColor){
            this.color = Textygons.transitionToColor(this.startColor, this.endColor, this.stepsDone);
            this.stepsDone += this.stepSize;
        }
    }

    public resetColor(): void{
        this.color = this.startColor;
        this.stepsDone = 0;
    }
}

//By Styn van de Haterd @ 2021
export class Textygons {
    private state: State;
    private deltaTime: DeltaTime;
    private options: Options;
    private canvas: Canvas;
    private displayableTexts: DisplayableText[];
    private currentText: number;
    private lemmings: Point[];
    private interval: number;
    private stateTimer: number;

    constructor() {
        this.state = State.DISPLAYING;
        this.deltaTime = new DeltaTime();
        this.displayableTexts = [];
        this.currentText = 0;
        this.lemmings = [];
        this.stateTimer = 0;

        let defaults = {
            canvasId: "testCanvas",
            textOffsetX: 0,
            textOffsetY: 0,
            strings: [],
            backgroundColor: "#FFF",
            pointColor: "#000",
            edgeColor: "#000",
            defaultFont: '"Open Sans", verdana, arial, sans-serif',
            textHoldTime: 3000,
            edgeFadeTime: 500,
            maxSpacing: 10,
            pointSize: 3,
            fps: 144
        }

        if (arguments[0] && typeof arguments[0] === "object") {
            this.options = Textygons.extendDefaults(defaults, arguments[0]);
        }
        else{
            this.options = defaults;
        }

        this.canvas = Textygons.loadCanvas(this.options.canvasId);
        this.interval = 1000 / this.options.fps;

        window.onresize = this.resizeFunction;
    }

    resizeFunction(event: any | null): void{
        this.canvas.element.width = this.canvas.element.parentElement!.clientWidth;
        this.canvas.element.height = this.canvas.element.parentElement!.clientHeight;

        this.canvas.width = this.canvas.context.canvas.width;
        this.canvas.height = this.canvas.context.canvas.height;
    };

    start(): void{
        this.resizeFunction(null);
        this.clearCanvas();

        _.forEach(this.options.strings, (string) => {
            const displayableText = this.graphToDisplayableText(this.createGraphFromText(string));
            this.fillPointsOnLine(displayableText);
            this.displayableTexts.push(displayableText);
        });

        this.loadLemmingsFromText(this.displayableTexts[this.currentText]);
        setInterval(this.update.bind(this), this.interval);
    }

    update(): void{
        this.deltaTime.update();
        if(this.state == State.DISPLAYING){
            this.clearCanvas();
            this.updateEdges();
            this.drawEdges();
            this.drawPoints();
            this.checkState();
        }
        else if(this.state == State.TRANSFORMING){
            this.clearCanvas();
            this.updatePoints();
            this.drawPoints();
            this.checkState();
        }
        this.stateTimer += this.deltaTime.deltaTime;
    }

    createGraphFromText(textString: TextString): any{
        const font = textString.font == null ? this.options.defaultFont : textString.font;
        return VectorizeText(textString.text, {
            width: textString.width,
            height: textString.height,
            font: [
                font
            ],
            textAlign: "center",
            textBaseline: "middle"
        });
    }

    clearCanvas(): void{
        this.canvas.context.fillStyle = this.options.backgroundColor;
        this.canvas.context.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    drawEdges(): void{
        _.forEach(this.displayableTexts[this.currentText].edges, (edge) => {
            this.canvas.context.strokeStyle = edge.color;
            this.canvas.context.beginPath();
            this.canvas.context.moveTo(edge.start.x, edge.start.y);
            this.canvas.context.lineTo(edge.end.x, edge.end.y);
            this.canvas.context.stroke();
        });
    }

    drawPoints(): void{
        _.forEach(this.lemmings, (point) => {
            this.canvas.context.fillStyle = this.options.pointColor;
            this.canvas.context.beginPath();
            this.canvas.context.fillRect(point.x - (this.options.pointSize / 2), point.y - (this.options.pointSize / 2), 3, 3);
            this.canvas.context.stroke();
        });
    }

    updateEdges(): void{
        _.forEach(this.displayableTexts[this.currentText].edges, (edge) => {
            edge.fadeColor();
        });
    }

    updatePoints(): void{
        _.forEach(this.lemmings, (point) => {
            point.moveTowardsDestination(1.75);
        });
    }

    checkState(): void{
        if(this.state == State.DISPLAYING && this.stateTimer >= this.options.textHoldTime){
            this.setState(State.LOADING);
            this.resetEdgeColors(this.displayableTexts[this.currentText]);
            this.setNewText();
            this.switchTexts(this.displayableTexts[this.currentText]);
            this.setState(State.TRANSFORMING);
            this.resetStateTimer();
        }
        else if(this.state == State.TRANSFORMING && this.allLemmingsDoneMoving()){
            this.setState(State.DISPLAYING);
            this.resetStateTimer();
        }
    }

    setState(state: State): void{
        this.state = state;
    }

    resetStateTimer(): void{
        this.stateTimer = 0;
    }

    setNewText(): void{
        this.currentText = this.currentText + 1 >= this.displayableTexts.length ? 0 : this.currentText + 1;
    }

    resetEdgeColors(displayableText: DisplayableText) {
        _.forEach(displayableText.edges, (edge) => {
           edge.resetColor();
        });
    }

    switchTexts(newDisplayableText: DisplayableText): void{
        const unclaimedPoints: Point[] = [];
        let differenceInPoints = newDisplayableText.points.length - this.lemmings.length;

        _.forEach(newDisplayableText.points, (point) => {
            unclaimedPoints.push(point);
        });

        if(differenceInPoints > 0){
            while(differenceInPoints > 0){
                let copyLemming = this.lemmings[Textygons.randomIntBetween(0, this.lemmings.length - 1)].copy();
                this.lemmings.push(copyLemming);
                --differenceInPoints;
            }
        }
        else if(differenceInPoints < 0){
            this.lemmings = _.slice(this.lemmings, 0, this.lemmings.length + differenceInPoints)
        }

        _.forEach(this.lemmings, (lemming) =>{
            if(unclaimedPoints.length == 0) return;
            const index = Textygons.randomIntBetween(0, unclaimedPoints.length - 1);
            const point = unclaimedPoints[index];
            unclaimedPoints.splice(index, 1);
            lemming.destinationPoint = point.copy();
        });
    }

    graphToDisplayableText(graph: any): DisplayableText{
        const displayableText: DisplayableText = {
            text: graph.text,
            points: [],
            edges: []
        };

        _.forEach(graph.edges, (edge) => {
            const start: Point = new Point(graph.positions[edge[0]][0] + this.options.textOffsetX, graph.positions[edge[0]][1] + this.options.textOffsetY);
            const end: Point = new Point(graph.positions[edge[1]][0] + this.options.textOffsetX, graph.positions[edge[1]][1] + this.options.textOffsetY);

            const newEdge = new Edge(start, end);
            newEdge.setFadeColor(this.options.backgroundColor, this.options.edgeColor, 1.0 / (this.options.edgeFadeTime / this.interval))

            displayableText.edges.push(newEdge);
            displayableText.points.push(start, end);
        });

        return displayableText;
    }

    fillPointsOnLine(displayableText: DisplayableText): void {
        _.forEach(displayableText.edges, (edge) => {
            const totalLineDistance = Textygons.DistanceBetweenPoints(edge.start, edge.end);
            const numberOfPoints = floor(totalLineDistance / this.options.maxSpacing);

            for (let i = 1; i < numberOfPoints; i++) {
                const distance = edge.start.subtract(edge.end);
                const increment = distance.divide(numberOfPoints);
                const newPoint: Point = Textygons.GetPointOnLine(edge.start, edge.end, increment, i);
                displayableText.points.push(newPoint);
            }
        });
    }

    loadLemmingsFromText(displayableText: DisplayableText): void {
        this.lemmings = [];
        _.forEach(displayableText.points, (point) => {
            this.lemmings.push(point.copy());
        });
    }

    allLemmingsDoneMoving(): boolean{
        for(let i = 0; i < this.lemmings.length; ++i){
            const lemming = this.lemmings[i];
            if(lemming.isValid() && !lemming.isAtDestinationPoint()){
                return false;
            }
        }
        return true;
    }

    static getCanvasSize(canvasId: string): Dimensions{
        const c = <HTMLCanvasElement>document.getElementById(canvasId);
        return { width: c.offsetWidth, height: c.offsetHeight };
    }

    static extendDefaults(source: any, properties: any): Options{
        let property;
        for (property in properties) {
            if (properties.hasOwnProperty(property)) {
                source[property] = properties[property];
            }
        }
        return source;
    };

    static loadCanvas(canvasId: string): Canvas{
        const c = <HTMLCanvasElement>document.getElementById(canvasId);
        const ctx = c.getContext("2d")!;
        return { element: c, context: ctx, width: c.width, height: c.height };
    }

    static DistanceBetweenPoints(start: Point, end: Point): number {
        const a = start.x - end.x;
        const b = start.y - end.y;
        return Math.sqrt(a * a + b * b);
    }

    static GetPointOnLine(start: Point, end: Point, increment: Point, index: number): Point {
        let point = start;
        for (let i = 0; i < index; ++i) {
            point = point.subtract(increment);
        }
        return point
    }

    static randomIntBetween(min: number, max: number): number{
        return Math.floor(Math.random() * (max - min + 1) + min)
    }

    static transitionToColor(start: string, end: string, step: number): string{
        const startRgb = this.hexToRgb(start)!;
        const endRgb = this.hexToRgb(end)!;
        const r = Math.floor(Textygons.lerp(startRgb.r, endRgb.r, step));
        const g = Math.floor(Textygons.lerp(startRgb.g, endRgb.g, step));
        const b = Math.floor(Textygons.lerp(startRgb.b, endRgb.b, step));
        return Textygons.rgbToHex(r, g, b);
    }

    static hexToRgb(hex: string): RGB | null {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }

    static rgbToHex(r: number, g: number, b: number): string {
        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }

    static lerp(a: number, b: number, u: number): number{
        return (1 - u) * a + u * b;
    }
}

