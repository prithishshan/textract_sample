import { Component, ChangeDetectionStrategy, input, computed, signal } from '@angular/core';

interface PageData {
  pageNumber: number;
  lines: any[];
}

@Component({
  selector: 'app-text-overlay',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tabs">
        <button [class.active]="activeTab() === 'overlay'" (click)="activeTab.set('overlay')">Text Overlay</button>
        <button [class.active]="activeTab() === 'form'" (click)="activeTab.set('form')">Form Data</button>
    </div>

    <!-- TAB 1: OVERLAY -->
    @if (activeTab() === 'overlay') {
      <div class="overlay-scroll-container">
        @for (page of pages(); track page.pageNumber) {
          <div class="page-container">
            <div class="page-label">Page {{ page.pageNumber }}</div>
            <div class="page-content">
              @for (block of page.lines; track $index) {
                <div 
                   [style.top]="(block.Geometry.BoundingBox.Top * 100) + '%'"
                   [style.left]="(block.Geometry.BoundingBox.Left * 100) + '%'"
                   [style.width]="(block.Geometry.BoundingBox.Width * 100) + '%'"
                   [style.height]="(block.Geometry.BoundingBox.Height * 100) + '%'"
                   class="text-block"
                   [title]="block.Text">
                  {{ block.Text }}
                </div>
              }
            </div>
          </div>
        }
      </div>
    }

    <!-- TAB 2: FORM DATA -->
    @if (activeTab() === 'form') {
      <div class="form-data-container">
          <table class="form-table">
              <thead>
                  <tr>
                      <th>Field</th>
                      <th>Value</th>
                  </tr>
              </thead>
              <tbody>
                  @for (item of formData(); track item.key) {
                    <tr>
                        <td>{{ item.key }}</td>
                        <td>
                          @if (isBoolean(item.value)) {
                            <input type="checkbox" [checked]="item.value" disabled>
                          } @else if (isArray(item.value)) {
                             {{ item.value.join(', ') }}
                          } @else {
                             {{ item.value }}
                          }
                        </td>
                    </tr>
                  }
              </tbody>
          </table>
      </div>
    }
  `,
  styles: [`
    .tabs {
        display: flex;
        border-bottom: 1px solid #ddd;
        margin-bottom: 10px;
    }
    .tabs button {
        padding: 10px 20px;
        border: none;
        background: none;
        cursor: pointer;
        font-weight: bold;
        color: #666;
    }
    .tabs button.active {
        color: #007bff;
        border-bottom: 2px solid #007bff;
    }
    .form-data-container {
        padding: 10px;
        height: 100%;
        overflow: auto;
    }
    .form-table {
        width: 100%;
        border-collapse: collapse;
    }
    .form-table th, .form-table td {
        text-align: left;
        padding: 8px;
        border-bottom: 1px solid #eee;
    }
    .form-table th {
        background-color: #f9f9f9;
        font-weight: 600;
    }

    .overlay-scroll-container {
      width: 100%;
      box-sizing: border-box;
      padding: 10px;
    }
    .page-container {
      margin-bottom: 20px;
      border: 1px solid #ddd;
      background: #fdfdfd;
      box-shadow: 0 2px 5px rgba(0,0,0,0.1);
    }
    .page-label {
      background: #eee;
      padding: 5px 10px;
      font-weight: bold;
      border-bottom: 1px solid #ddd;
      font-size: 12px;
      color: #666;
    }
    .page-content {
      position: relative;
      width: 100%;
      /* Aspect ratio for A4/Letter is roughly 1:1.4. 
         Setting a min-height ensures mapped percentages have room. */
      aspect-ratio: 1 / 1.414; 
      overflow: hidden;
    }
    .text-block {
      position: absolute;
      border: 1px dashed rgba(0, 0, 0, 0.05); /* very subtle border */
      font-size: 11px; 
      line-height: 1;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: visible; /* Let it overflow slightly if needed to be readable */
      color: #333;
      pointer-events: auto;
    }
    .text-block:hover {
      background: rgba(255, 255, 0, 0.2);
      z-index: 100;
      border: 1px solid blue;
      white-space: normal;
      background-color: white;
    }
  `]
})
export class TextOverlayComponent {
  data = input<any>();
  activeTab = signal<'overlay' | 'form'>('overlay');

  pages = computed(() => {
    const rawData = this.data();
    return rawData && rawData.Blocks ? this.processBlocks(rawData.Blocks) : [];
  });

  formData = computed(() => {
    const rawData = this.data();
    // rawData now contains { StructuredData, Blocks }
    return rawData && rawData.StructuredData ? this.processFormData(rawData.StructuredData) : [];
  });

  private processBlocks(blocks: any[]): PageData[] {
    // 1. Filter for LINE blocks only
    const lines = blocks.filter(b => b.BlockType === 'LINE');

    // 2. Group by Page
    const methodMap = new Map<number, any[]>();

    lines.forEach(line => {
      // Default to page 1 if not present
      const pageNum = line.Page || 1;
      if (!methodMap.has(pageNum)) {
        methodMap.set(pageNum, []);
      }
      methodMap.get(pageNum)?.push(line);
    });

    // 3. Convert map to array and sort by page number
    return Array.from(methodMap.entries())
      .map(([pageNumber, lines]) => ({ pageNumber, lines }))
      .sort((a, b) => a.pageNumber - b.pageNumber);
  }

  isBoolean(val: any): boolean {
    return typeof val === 'boolean';
  }

  isArray(val: any): boolean {
    return Array.isArray(val);
  }

  private processFormData(structuredData: any): { key: string, value: any }[] {
    return Object.entries(structuredData).map(([key, value]) => ({
      key,
      value // Keep original value to check type in template
    }));
  }
}
