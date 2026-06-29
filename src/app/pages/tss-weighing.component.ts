import { Component } from '@angular/core';

@Component({
  selector: 'app-tss-weighing',
  standalone: true,
  template: `
    <iframe
      class="tss-weighing-frame"
      src="/tss_weighing/tss_weighing.html"
      title="TSS Weighing Sheet"
    ></iframe>
  `,
  styles: [`
    :host {
      display: block;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
    }

    .tss-weighing-frame {
      display: block;
      width: 100%;
      height: 100%;
      border: 0;
    }
  `]
})
export class TssWeighingComponent {}
