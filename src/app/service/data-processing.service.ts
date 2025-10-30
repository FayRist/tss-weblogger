import { Injectable } from '@angular/core';
import { BehaviorSubject} from 'rxjs';
import { CarLogger } from '../../../public/models/car-logger.model';

export interface ProcessingProgress {
  current: number;
  total: number;
  percentage: number;
  isComplete: boolean;
  processingSpeed: number;
  estimatedTime: string;
  memoryUsage: number;
}

@Injectable({
  providedIn: 'root'
})
export class DataProcessingService {
  private dataSubject = new BehaviorSubject<CarLogger[]>([]);
  private progressSubject = new BehaviorSubject<ProcessingProgress>({
    current: 0,
    total: 0,
    percentage: 0,
    isComplete: false,
    processingSpeed: 0,
    estimatedTime: '--',
    memoryUsage: 0
  });

  public data$ = this.dataSubject.asObservable();
  public progress$ = this.progressSubject.asObservable();

  private readonly CHUNK_SIZE = 1000; // จำนวนบรรทัดที่ประมวลผลต่อครั้ง
  private readonly DELAY_BETWEEN_CHUNKS = 10; // มิลลิวินาทีระหว่างการประมวลผลแต่ละ chunk

  private startTime: number = 0;
  private lastUpdateTime: number = 0;

  /**
   * ประมวลผลไฟล์ข้อมูลแบบ Progressive Loading
   */
  async processFileAsync(file: File): Promise<void> {
    console.log('DataProcessingService: Starting file processing...');
    console.log('File details:', file.name, file.size, 'bytes');

    try {
      this.startTime = Date.now();
      this.lastUpdateTime = this.startTime;

      console.log('DataProcessingService: Reading file as text...');
      const text = await this.readFileAsText(file);
      console.log('DataProcessingService: File read successfully, length:', text.length);

      const lines = text.split('\n');
      console.log('DataProcessingService: Total lines:', lines.length);

      // หาตำแหน่งของ column names และ data
      const columnStartIndex = lines.findIndex(line => line.trim() === '[columnnames]');
      const dataStartIndex = lines.findIndex(line => line.trim() === '[data]');

      console.log('DataProcessingService: Column start index:', columnStartIndex);
      console.log('DataProcessingService: Data start index:', dataStartIndex);

      if (columnStartIndex === -1 || dataStartIndex === -1) {
        throw new Error('Invalid file format - missing [columnnames] or [data] sections');
      }

      const columns = lines[columnStartIndex + 1].trim().split(/\s+/);
      const dataLines = lines.slice(dataStartIndex + 1).filter(line => line.trim() !== '');

      console.log('DataProcessingService: Columns found:', columns);
      console.log('DataProcessingService: Data lines to process:', dataLines.length);

      const totalLines = dataLines.length;
      this.updateProgress(0, totalLines);

      // เริ่มต้นด้วย array ว่าง
      this.dataSubject.next([]);

      console.log('DataProcessingService: Starting chunk processing...');

      // ประมวลผลแบบ chunk
      for (let i = 0; i < totalLines; i += this.CHUNK_SIZE) {
        const chunk = dataLines.slice(i, i + this.CHUNK_SIZE);
        const processedChunk = this.processChunk(chunk, columns);

        // อัพเดทข้อมูลแบบ progressive
        const currentData = this.dataSubject.value;
        const newData = [...currentData, ...processedChunk];
        this.dataSubject.next(newData);

        // คำนวณ performance metrics
        const currentTime = Date.now();
        const elapsedTime = (currentTime - this.lastUpdateTime) / 1000; // วินาที
        const processedInChunk = Math.min(this.CHUNK_SIZE, totalLines - i);
        const processingSpeed = processedInChunk / elapsedTime;

        // คำนวณ ETA
        const remainingRecords = totalLines - (i + this.CHUNK_SIZE);
        const estimatedSeconds = remainingRecords / processingSpeed;
        const estimatedTime = this.formatTime(estimatedSeconds);

        // คำนวณ memory usage (ประมาณการ)
        const memoryUsage = this.estimateMemoryUsage(newData);

        // อัพเดทความคืบหน้า
        this.updateProgress(
          Math.min(i + this.CHUNK_SIZE, totalLines),
          totalLines,
          false,
          processingSpeed,
          estimatedTime,
          memoryUsage
        );

        this.lastUpdateTime = currentTime;

        console.log(`DataProcessingService: Processed chunk ${Math.floor(i/this.CHUNK_SIZE) + 1}, progress: ${Math.round((i + this.CHUNK_SIZE) / totalLines * 100)}%`);

        // รอสักครู่เพื่อให้ UI อัพเดท
        await this.delay(this.DELAY_BETWEEN_CHUNKS);
      }

      this.updateProgress(totalLines, totalLines, true);
      console.log('DataProcessingService: File processing completed successfully!');

    } catch (error) {
      console.error('DataProcessingService: Error processing file:', error);
      throw error;
    }
  }

  /**
   * ประมวลผล chunk ของข้อมูล
   */
  private processChunk(chunk: string[], columns: string[]): CarLogger[] {
    return chunk.map(line => {
      const values = line.trim().split(/\s+/);
      const obj: any = {};

      columns.forEach((col, idx) => {
        obj[col] = values[idx] || '';
      });

      return obj as CarLogger;
    });
  }

  /**
   * อ่านไฟล์เป็น text
   */
  private readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  /**
   * อัพเดทความคืบหน้า
   */
  private updateProgress(
    current: number,
    total: number,
    isComplete: boolean = false,
    processingSpeed: number = 0,
    estimatedTime: string = '--',
    memoryUsage: number = 0
  ): void {
    const percentage = Math.round((current / total) * 100);
    this.progressSubject.next({
      current,
      total,
      percentage,
      isComplete,
      processingSpeed,
      estimatedTime,
      memoryUsage
    });
  }

  /**
   * คำนวณ ETA
   */
  private formatTime(seconds: number): string {
    if (seconds < 60) {
      return `${Math.round(seconds)}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = Math.round(seconds % 60);
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${minutes}m`;
    }
  }

  /**
   * ประมาณการการใช้ memory
   */
  private estimateMemoryUsage(data: CarLogger[]): number {
    // ประมาณการขนาดของ object หนึ่งตัว (bytes)
    const avgObjectSize = 200; // bytes
    const totalBytes = data.length * avgObjectSize;
    return totalBytes / (1024 * 1024); // แปลงเป็น MB
  }

  /**
   * Delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * ล้างข้อมูลทั้งหมด
   */
  clearData(): void {
    this.dataSubject.next([]);
    this.updateProgress(0, 0, false);
  }

  /**
   * ดึงข้อมูลปัจจุบัน
   */
  getCurrentData(): CarLogger[] {
    return this.dataSubject.value;
  }

  /**
   * คำนวณค่าเฉลี่ยสะสมแบบ efficient
   */
  calculateRunningAverage(data: CarLogger[]): CarLogger[] {
    let sum = 0;
    return data.map((log, index) => {
      const h = parseFloat(log.height);
      if (!isNaN(h)) {
        sum += h;
      }
      const avg = sum / (index + 1);
      return {
        ...log,
        averageHeight: parseFloat(avg.toFixed(3))
      };
    });
  }

  /**
   * รวมข้อมูล WebSocket กับข้อมูลที่มีอยู่
   */
  mergeWebSocketData(wsData: CarLogger[]): void {
    if (wsData.length > 0) {
      const currentData = this.dataSubject.value;
      const combinedData = [...currentData, ...wsData];

      // ลบข้อมูลซ้ำ
      const uniqueData = this.removeDuplicateData(combinedData);

      // อัพเดทข้อมูล
      this.dataSubject.next(uniqueData);

      console.log('DataProcessingService: Merged WebSocket data, total records:', uniqueData.length);
    }
  }

  /**
   * ลบข้อมูลซ้ำ
   */
  private removeDuplicateData(data: CarLogger[]): CarLogger[] {
    const seen = new Set();
    return data.filter(item => {
      // ใช้ time และ lat/long เป็น key สำหรับตรวจสอบข้อมูลซ้ำ
      const key = `${item.time}_${item.lat}_${item.long}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }
}
