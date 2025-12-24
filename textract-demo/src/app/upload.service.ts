import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class UploadService {
  private http = inject(HttpClient);
  private apiUrl = 'http://localhost:3000/analyze';

  uploadPdf(file: File): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);

    // We need to send two distinct requests because FormData cannot be reused 
    // effectively depending on browser/implementation nuances, but cloning it is safer 
    // or just creating it here. Actually, we can reuse the formData object in the calls usually.
    // But to be safe and avoid "already read" issues if any stream based, let's keep separate.
    // Actually, FormData is safe to reuse in Angular/Browser HttpClient.

    return forkJoin({
      structured: this.http.post<any>('http://localhost:3001/analyze', formData),
      blocks: this.http.post<any>('http://localhost:3001/analyze-blocks', formData)
    }).pipe(
      map(results => ({
        StructuredData: results.structured.StructuredData,
        Blocks: results.blocks.Blocks
      }))
    );
  }
}
