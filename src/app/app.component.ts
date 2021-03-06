import {
  Component,
  OnInit,
  AfterViewInit,
  ViewChild,
  ElementRef
} from "@angular/core";
import * as tf from "@tensorflow/tfjs";
import { Webcam } from "./webcam";
import { ControllerDataset } from "./controller-dataset";

import { interval } from "rxjs";
import { throttle } from "rxjs/operators";
import { Observable, Subject } from "rxjs";

@Component({
  selector: "app-root",
  templateUrl: "./app.component.html",
  styleUrls: ["./app.component.scss"]
})
export class AppComponent {
  title = "accessible";
  CONTROLS: Array<string> = ["Next Element", "second", "Click", "control"];
  NUM_CLASSES: number = 4;
  webcam: Webcam;
  controllerDataset: ControllerDataset;
  truncatedMobileNet: any;
  model: any;
  addExampleHandler: any;
  thumbDisplayed: Object = {};
  isPredicting: boolean = false;
  predictingVisible: boolean = true;

  currentMove: string;

  learningRates: Array<Object> = [
    { num: 0.00001, name: "0.00001" },
    { num: 0.0001, name: "0.0001" },
    { num: 0.001, name: "0.001" },
    { num: 0.003, name: "0.003" }
  ];

  batchSizes: Array<Object> = [
    { num: 0.05, name: "0.05" },
    { num: 0.1, name: "0.1" },
    { num: 0.4, name: "0.4" },
    { num: 1, name: "1" }
  ];
  epochsOptions: Array<Object> = [
    { num: 10, name: "10" },
    { num: 20, name: "20" },
    { num: 40, name: "40" }
  ];
  hiddenUnits: Array<Object> = [
    { num: 10, name: "10" },
    { num: 100, name: "100" },
    { num: 200, name: "200" }
  ];

  learningRateSel: number = 0.0001;
  batchSizeSel: number = 0.4;
  epochSel: number = 20;
  denseSel: number = 100;

  @ViewChild("controller") controller: ElementRef;
  @ViewChild("status") statusEl: ElementRef;
  @ViewChild("webcam") webcamEl: ElementRef;
  @ViewChild("thirdThumb") thirdThumb: ElementRef;
  @ViewChild("controlThumb") controlThumb: ElementRef;
  @ViewChild("firstThumb") firstThumb: ElementRef;
  @ViewChild("secondThumb") secondThumb: ElementRef;
  @ViewChild("moodFile") moodFile: ElementRef;
  @ViewChild("weightsFile") weightsFileEl: ElementRef;

  BUTTONS: Array<ElementRef>;

  fileName1: string;
  fileName2: string;

  jsonFile: File;
  weightsFile: File;

  donejson: boolean = false;
  doneweights: boolean = false;

  trainStatus: string = "TRAIN MODEL";
  doneTraining: boolean = false;
  downloaded: boolean = false;
  uploadedjson: boolean = false;
  uploadingjson: boolean = false;
  uploadedweights: boolean = false;
  uploadingweights: boolean = false;

  public focusable: NodeListOf<HTMLElement>;
  counter: number = 0;
  clickIt: HTMLElement;

  actionClass: Subject<number>;

  constructor() {
    this.controllerDataset = new ControllerDataset(this.NUM_CLASSES);
    this.actionClass = new Subject();
  }

  ngOnInit() {
    this.init();
    let action = this.actionClass.pipe(throttle(val => interval(3000)));
    action.subscribe(x => {
      console.log("emission", x);
      this.takeAction(x);
    });
  }

  takeAction(num: number) {
    console.log("taking action", num);
    this.focusable = document.querySelectorAll(
      'button, a, input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    let foc = this.focusable;
    if (num === 0) {
      console.log(foc.item(this.counter));
      foc.item(this.counter).focus();
      if (this.counter < foc.length - 1) {
        this.counter++;
      } else {
        this.counter = 0;
      }
    }
    if (num === 2) {
      console.log(foc.item(this.counter));
      foc.item(this.counter === 0 ? 0 : this.counter - 1).click();
    }
  }

  ngAfterViewInit() {
    console.log("hey");
    this.BUTTONS = [
      this.firstThumb,
      this.secondThumb,
      this.thirdThumb,
      this.controlThumb
    ];
    this.webcam = new Webcam(this.webcamEl.nativeElement);
    this.webcam
      .setup()
      .then(() => {
        console.log("trying");
      })
      .catch(() => {
        document.getElementById("no-webcam").style.display = "block";
      });
    this.setExampleHandler(label => {
      tf.tidy(() => {
        const img = this.webcam.capture();
        this.controllerDataset.addExample(
          this.truncatedMobileNet.predict(img),
          label
        );

        this.drawThumb(img, label);
      });
    });

    // Just for visual que for now

    let focusables = document.querySelectorAll(
      'button, a, input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    focusables.forEach(el => {
      el.addEventListener("focus", function() {
        this.style.border = "thick solid #FF0000";
      });
      el.addEventListener("blur", function() {
        this.style.border = "unset";
      });
    });
  }

  async init() {
    this.truncatedMobileNet = await this.loadTruncatedMobileNet();
    tf.tidy(() => this.truncatedMobileNet.predict(this.webcam.capture()));
    this.controller.nativeElement.style.display = "";
    this.statusEl.nativeElement.style.display = "none";
  }

  async loadTruncatedMobileNet() {
    const mobilenet = await tf.loadModel(
      "https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_0.25_224/model.json"
    );
    const layer = mobilenet.getLayer("conv_pw_13_relu");
    return tf.model({ inputs: mobilenet.inputs, outputs: layer.output });
  }

  setExampleHandler(handler) {
    this.addExampleHandler = handler;
  }

  async train() {
    if (this.controllerDataset.xs == null) {
      throw new Error("Add some examples before training!");
    }
    this.model = tf.sequential({
      layers: [
        tf.layers.flatten({
          inputShape: this.truncatedMobileNet.outputs[0].shape.slice(1)
        }),
        // Layer 1.
        tf.layers.dense({
          units: +this.denseSel,
          activation: "relu",
          kernelInitializer: "varianceScaling",
          useBias: true
        }),
        // Layer 2. The number of units of the last layer should correspond
        // to the number of classes we want to predict.
        tf.layers.dense({
          units: this.NUM_CLASSES,
          kernelInitializer: "varianceScaling",
          useBias: false,
          activation: "softmax"
        })
      ]
    });

    const optimizer = tf.train.adam(this.learningRateSel);
    this.model.compile({
      optimizer: optimizer,
      loss: "categoricalCrossentropy"
    });
    const batchSize = Math.floor(
      this.controllerDataset.xs.shape[0] * this.batchSizeSel
    );
    if (!(batchSize > 0)) {
      throw new Error(
        `Batch size is 0 or NaN. Please choose a non-zero fraction.`
      );
    }
    this.model.fit(this.controllerDataset.xs, this.controllerDataset.ys, {
      batchSize,
      epochs: +this.epochSel,
      callbacks: {
        onBatchEnd: async (batch, logs) => {
          this.trainStatus = "Loss: " + logs.loss.toFixed(5);
          this.doneTraining = true;
        }
      }
    });
  }

  async predict() {
    this.predictingVisible = true;

    while (this.isPredicting) {
      const predictedClass = tf.tidy(() => {
        const img = this.webcam.capture();
        const embeddings = this.truncatedMobileNet.predict(img);
        const predictions = this.model.predict(embeddings);
        return predictions.as1D().argMax();
      });
      const classId = (await predictedClass.data())[0];
      predictedClass.dispose();
      this.currentMove = this.CONTROLS[classId];
      this.actionClass.next(classId);
      await tf.nextFrame();
    }
    this.predictingVisible = false;
  }

  async trainBtn() {
    this.trainStatus = "Training...";
    await tf.nextFrame();
    await tf.nextFrame();
    this.isPredicting = false;
    this.train();
  }

  predictBtn() {
    this.currentMove = null;
    this.isPredicting = !this.isPredicting;
    this.predict();
  }

  async handler(label) {
    this.addExampleHandler(label);
    await tf.nextFrame();
  }

  drawThumb(img, label) {
    if (this.thumbDisplayed[label] == null) {
      console.log(this.BUTTONS);
      const thumbCanvas = this.BUTTONS[label].nativeElement;
      this.draw(img, thumbCanvas);
    }
  }

  draw(image, canvas) {
    const [width, height] = [224, 224];
    const ctx = canvas.getContext("2d");
    const imageData = new ImageData(width, height);
    const data = image.dataSync();
    for (let i = 0; i < height * width; ++i) {
      const j = i * 4;
      imageData.data[j + 0] = (data[i * 3 + 0] + 1) * 127;
      imageData.data[j + 1] = (data[i * 3 + 1] + 1) * 127;
      imageData.data[j + 2] = (data[i * 3 + 2] + 1) * 127;
      imageData.data[j + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
  }

  save() {
    this.model.save("indexeddb://access-model").then(x => {
      console.log("model saved", x);
    });
  }

  load() {
    tf.loadModel("indexeddb://access-model").then(x => {
      this.model = x;
      this.doneTraining = true;
    });
  }
}
