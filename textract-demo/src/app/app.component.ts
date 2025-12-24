import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TextOverlayComponent } from './text-overlay/text-overlay.component';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { UploadService } from './upload.service';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [CommonModule, TextOverlayComponent],
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.css']
})
export class AppComponent {
    title = 'textract-demo';
    pdfUrl: SafeResourceUrl | null = null;
    textractData: any = null;
    isLoading = false;
    error: string | null = null;

    constructor(
        private uploadService: UploadService,
        private sanitizer: DomSanitizer
    ) { }

    onFileSelected(event: any) {
        const file = event.target.files[0];
        if (file) {
            this.pdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(URL.createObjectURL(file));
            this.uploadFile(file);
        }
    }

    uploadFile(file: File) {
        this.isLoading = true;
        this.error = null;
        this.textractData = null;

        this.uploadService.uploadPdf(file).subscribe({
            next: (response) => {
                this.textractData = response;
                this.isLoading = false;
            },
            error: (err) => {
                console.error('Upload failed', err);
                this.error = 'Failed to analyze PDF. Ensure backend is running at port 3001 and AWS CLI is configured.';
                this.isLoading = false;
            }
        });
    }
}
