import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TextOverlayComponent } from './text-overlay/text-overlay.component';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { UploadService } from './upload.service';

@Component({
    selector: 'app-root',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, TextOverlayComponent],
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.css']
})
export class AppComponent {
    title = 'textract-demo';
    pdfUrl = signal<SafeResourceUrl | null>(null);
    textractData = signal<any>(null);
    isLoading = signal(false);
    error = signal<string | null>(null);

    private uploadService = inject(UploadService);
    private sanitizer = inject(DomSanitizer);

    onFileSelected(event: any) {
        const file = event.target.files[0];
        if (file) {
            this.pdfUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(URL.createObjectURL(file)));
            this.uploadFile(file);
        }
    }

    uploadFile(file: File) {
        this.isLoading.set(true);
        this.error.set(null);
        this.textractData.set(null);

        this.uploadService.uploadPdf(file).subscribe({
            next: (response) => {
                this.textractData.set(response);
                this.isLoading.set(false);
            },
            error: (err) => {
                console.error('Upload failed', err);
                this.error.set('Failed to analyze PDF. Ensure backend is running at port 3001 and AWS CLI is configured.');
                this.isLoading.set(false);
            }
        });
    }
}
