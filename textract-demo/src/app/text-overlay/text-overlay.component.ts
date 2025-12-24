import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

interface PageData {
  pageNumber: number;
  lines: any[];
}

@Component({
  selector: 'app-text-overlay',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="tabs">
        <button [class.active]="activeTab === 'overlay'" (click)="activeTab = 'overlay'">Text Overlay</button>
        <button [class.active]="activeTab === 'form'" (click)="activeTab = 'form'">Form Data</button>
    </div>

    <!-- TAB 1: OVERLAY -->
    <div class="overlay-scroll-container" *ngIf="activeTab === 'overlay'">
      <div *ngFor="let page of pages" class="page-container">
        <div class="page-label">Page {{ page.pageNumber }}</div>
        <div class="page-content">
          <div *ngFor="let block of page.lines" 
               [style.top]="(block.Geometry.BoundingBox.Top * 100) + '%'"
               [style.left]="(block.Geometry.BoundingBox.Left * 100) + '%'"
               [style.width]="(block.Geometry.BoundingBox.Width * 100) + '%'"
               [style.height]="(block.Geometry.BoundingBox.Height * 100) + '%'"
               class="text-block"
               [title]="block.Text">
            {{ block.Text }}
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 2: FORM DATA -->
    <div class="form-data-container" *ngIf="activeTab === 'form'">
        <table class="form-table">
            <thead>
                <tr>
                    <th>Field</th>
                    <th>Value</th>
                </tr>
            </thead>
            <tbody>
                <tr *ngFor="let item of formData">
                    <td>{{ item.key }}</td>
                    <td>{{ item.value }}</td>
                </tr>
            </tbody>
        </table>
    </div>
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
export class TextOverlayComponent implements OnChanges {
  @Input() data: any;
  pages: PageData[] = [];
  formData: { key: string, value: any }[] = [];
  activeTab: 'overlay' | 'form' = 'overlay';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data'] && this.data) {
      this.processBlocks(this.data.Blocks || []);
      this.processFormData(this.data.StructuredData || {});
    }
  }

  private processBlocks(blocks: any[]) {
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
    this.pages = Array.from(methodMap.entries())
      .map(([pageNumber, lines]) => ({ pageNumber, lines }))
      .sort((a, b) => a.pageNumber - b.pageNumber);

    console.log(`Processed ${this.pages.length} pages of text.`);
  }

  private processFormData(structuredData: any) {
    this.formData = Object.entries(structuredData).map(([key, value]) => ({
      key,
      value: Array.isArray(value) ? value.join(', ') : value
    }));
  }
}
