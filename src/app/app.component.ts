import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StorageService } from './services/storage.service';

interface PlaceholderState {
  id: number;
  imageData: string | null;
  offsetX: number;
  offsetY: number;
  scale: number;
  imageWidth: number;
  imageHeight: number;
  left: number;
  top: number;
  isDragOver?: boolean;
  isDraggingImage?: boolean;
}

interface DragState {
  active: boolean;
  placeholderId: number | null;
  startX: number;
  startY: number;
  startOffsetX: number;
  startOffsetY: number;
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'Cover Printer';

  // Build number from environment variables
  buildNumber = (window as any)?.env?.buildNumber || 'dev';

  // Storage service
  private storageService = new StorageService();

  // Dark mode state
  isDarkMode = signal(false);

  // Modal state
  showImpressum = false;

  // Paper sizes in cm
  paperSizes = [
    { label: '10×15 cm', width: 10, height: 15 },
    { label: '13×18 cm', width: 13, height: 18 },
    { label: 'A5', width: 14.8, height: 21 },
    { label: 'A4', width: 21, height: 29.7 }
  ];
  selectedPaperSize = this.paperSizes[0];
  selectedPaperSizeIndex = 0;

  // Picture dimensions in mm
  pictureWidth = 44;
  pictureHeight = 44;

  // Placeholder shape
  placeholderShape: 'rectangular' | 'round' = 'rectangular';

  // Spacing in mm
  margins = 4;
  spacing = 2;

  // Allow whitespace when dragging images
  allowWhitespace = false;

  // Show crop marks for cutting
  showCropMarks = true;

  // Error handling
  hasLayoutError = false;
  errorMessage = '';

  // Calculated grid
  rows = 0;
  columns = 0;
  placeholders: PlaceholderState[] = [];

  // Grid offset for centering (in mm)
  offsetX = 0;
  offsetY = 0;

  // Drag state for image positioning
  private dragState: DragState = {
    active: false,
    placeholderId: null,
    startX: 0,
    startY: 0,
    startOffsetX: 0,
    startOffsetY: 0
  };

  ngOnInit() {
    // Load settings from storage
    const settings = this.storageService.loadSettings();

    // Apply loaded settings
    this.selectedPaperSizeIndex = settings.selectedPaperSizeIndex;
    this.selectedPaperSize = this.paperSizes[settings.selectedPaperSizeIndex];
    this.pictureWidth = settings.pictureWidth;
    this.pictureHeight = settings.pictureHeight;
    this.margins = settings.margins;
    this.spacing = settings.spacing;
    this.allowWhitespace = settings.allowWhitespace;
    this.showCropMarks = settings.showCropMarks;
    this.placeholderShape = settings.placeholderShape;

    // Load and apply dark mode preference
    this.isDarkMode.set(this.storageService.getDarkMode());

    this.calculateGrid();
    this.updatePrintStyles();

    // Add global mouse event listeners for image dragging
    document.addEventListener('mousemove', this.onMouseMove.bind(this));
    document.addEventListener('mouseup', this.onMouseUp.bind(this));
  }

  onPaperSizeChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    this.selectedPaperSizeIndex = parseInt(select.value);
    this.selectedPaperSize = this.paperSizes[this.selectedPaperSizeIndex];
    this.calculateGrid();
    this.updatePrintStyles();
    this.saveSettings();
  }

  onParameterChange() {
    this.calculateGrid();
    this.saveSettings();
  }

  onAllowWhitespaceChange() {
    // Refit all images when the whitespace setting changes
    this.placeholders.forEach(placeholder => {
      if (placeholder.imageData && placeholder.imageWidth && placeholder.imageHeight) {
        this.fitImageToPlaceholder(placeholder);
      }
    });
    this.saveSettings();
  }

  calculateGrid() {
    // Convert all measurements to mm for consistency
    const paperWidthMm = this.selectedPaperSize.width * 10; // cm to mm
    const paperHeightMm = this.selectedPaperSize.height * 10; // cm to mm

    // For round placeholders, use diameter for both dimensions
    const pictureWidthMm = this.pictureWidth;
    const pictureHeightMm = this.placeholderShape === 'round' ? this.pictureWidth : this.pictureHeight;

    const marginMm = this.margins;
    const spacingMm = this.spacing;

    // Check for errors before calculating grid
    this.hasLayoutError = false;
    this.errorMessage = '';

    // Check if picture size (with margins) exceeds paper size
    const minRequiredWidth = pictureWidthMm + (2 * marginMm);
    const minRequiredHeight = pictureHeightMm + (2 * marginMm);

    if (minRequiredWidth > paperWidthMm) {
      this.hasLayoutError = true;
      this.errorMessage = `Error: Picture width (${pictureWidthMm}mm) plus margins (2×${marginMm}mm = ${2*marginMm}mm) exceeds paper width (${paperWidthMm}mm). Required: ${minRequiredWidth}mm, available: ${paperWidthMm}mm.`;
      this.rows = 0;
      this.columns = 0;
      this.placeholders = [];
      return;
    }

    if (minRequiredHeight > paperHeightMm) {
      this.hasLayoutError = true;
      this.errorMessage = `Error: Picture height (${pictureHeightMm}mm) plus margins (2×${marginMm}mm = ${2*marginMm}mm) exceeds paper height (${paperHeightMm}mm). Required: ${minRequiredHeight}mm, available: ${paperHeightMm}mm.`;
      this.rows = 0;
      this.columns = 0;
      this.placeholders = [];
      return;
    }

    // Calculate available space (subtracting margins from both sides)
    const availableWidth = paperWidthMm - (2 * marginMm);
    const availableHeight = paperHeightMm - (2 * marginMm);

    // Calculate how many pictures fit
    // Formula: floor((available + spacing) / (picture + spacing))
    // The spacing is added to available because the last picture doesn't need spacing after it
    this.columns = Math.floor((availableWidth + spacingMm) / (pictureWidthMm + spacingMm));
    this.rows = Math.floor((availableHeight + spacingMm) / (pictureHeightMm + spacingMm));

    // Check if no pictures can fit (even though individual size checks passed)
    if (this.columns <= 0 || this.rows <= 0) {
      this.hasLayoutError = true;
      this.errorMessage = `Error: No space for pictures on the selected paper. Picture size: ${pictureWidthMm}×${pictureHeightMm}mm, available area after margins: ${availableWidth}×${availableHeight}mm. Please reduce picture size or margins.`;
      this.rows = 0;
      this.columns = 0;
      this.placeholders = [];
      return;
    }

    // Calculate total grid dimensions (without the trailing spacing)
    const totalGridWidth = (this.columns * pictureWidthMm) + ((this.columns - 1) * spacingMm);
    const totalGridHeight = (this.rows * pictureHeightMm) + ((this.rows - 1) * spacingMm);

    // Center the grid within available space
    this.offsetX = marginMm + (availableWidth - totalGridWidth) / 2;
    this.offsetY = marginMm + (availableHeight - totalGridHeight) / 2;

    // Generate placeholder array with position information
    const totalPlaceholders = this.rows * this.columns;
    this.placeholders = Array(totalPlaceholders).fill(null).map((_, index) => {
      const row = Math.floor(index / this.columns);
      const col = index % this.columns;

      return {
        id: index,
        imageData: null,
        offsetX: 0,
        offsetY: 0,
        scale: 1,
        imageWidth: 0,
        imageHeight: 0,
        // Calculate position in mm
        left: this.offsetX + (col * (pictureWidthMm + spacingMm)),
        top: this.offsetY + (row * (pictureHeightMm + spacingMm)),
        isDragOver: false
      };
    });
  }

  updatePrintStyles() {
    // Remove existing dynamic print styles
    const existingStyle = document.getElementById('dynamic-print-styles');
    if (existingStyle) {
      existingStyle.remove();
    }

    // Create new style element with dynamic print styles
    const style = document.createElement('style');
    style.id = 'dynamic-print-styles';
    style.innerHTML = `
      @media print {
        @page {
          size: ${this.selectedPaperSize.width}cm ${this.selectedPaperSize.height}cm;
          margin: 0;
        }

        html {
          height: ${this.selectedPaperSize.height}cm;
          width: ${this.selectedPaperSize.width}cm;
        }

        body {
          background: white !important;
          margin: 0 !important;
          padding: 0 !important;
          height: ${this.selectedPaperSize.height}cm !important;
          width: ${this.selectedPaperSize.width}cm !important;
          overflow: hidden !important;
          position: relative !important;
        }

        .app-container {
          background: white;
          height: ${this.selectedPaperSize.height}cm !important;
          width: ${this.selectedPaperSize.width}cm !important;
          overflow: hidden !important;
          margin: 0 !important;
          padding: 0 !important;
        }

        .main-content {
          padding: 0 !important;
          margin: 0 !important;
          display: block !important;
          height: ${this.selectedPaperSize.height}cm !important;
          width: ${this.selectedPaperSize.width}cm !important;
          overflow: hidden !important;
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
        }

        .print-preview {
          padding: 0 !important;
          margin: 0 !important;
          box-shadow: none !important;
          border-radius: 0 !important;
          height: ${this.selectedPaperSize.height}cm !important;
          width: ${this.selectedPaperSize.width}cm !important;
          overflow: hidden !important;
          display: block !important;
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
        }

        .preview-container {
          padding: 0 !important;
          margin: 0 !important;
          height: ${this.selectedPaperSize.height}cm !important;
          width: ${this.selectedPaperSize.width}cm !important;
          overflow: hidden !important;
          display: block !important;
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
        }

        .paper {
          box-shadow: none !important;
          border: none !important;
          margin: 0 !important;
          padding: 0 !important;
          height: ${this.selectedPaperSize.height}cm !important;
          width: ${this.selectedPaperSize.width}cm !important;
          overflow: hidden !important;
        }
      }
    `;

    // Add the style to the document head
    document.head.appendChild(style);
  }

  // Drag and drop event handlers
  onDragOver(event: DragEvent, placeholder: PlaceholderState) {
    event.preventDefault();
    event.stopPropagation();
    placeholder.isDragOver = true;
  }

  onDragLeave(event: DragEvent, placeholder: PlaceholderState) {
    event.preventDefault();
    event.stopPropagation();
    placeholder.isDragOver = false;
  }

  onDrop(event: DragEvent, placeholder: PlaceholderState) {
    event.preventDefault();
    event.stopPropagation();
    placeholder.isDragOver = false;

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      const file = files[0];

      // Check if file is an image
      if (file.type.startsWith('image/')) {
        this.loadImage(file, placeholder);
      }
    }
  }

  loadImage(file: File, placeholder: PlaceholderState) {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Store image data and dimensions
        placeholder.imageData = e.target?.result as string;
        placeholder.imageWidth = img.width;
        placeholder.imageHeight = img.height;

        // Reset to fit the entire image
        this.fitImageToPlaceholder(placeholder);
      };
      img.src = e.target?.result as string;
    };

    reader.readAsDataURL(file);
  }

  private fitImageToPlaceholder(placeholder: PlaceholderState) {
    if (!placeholder.imageWidth || !placeholder.imageHeight) {
      return;
    }

    // Get the actual placeholder dimensions in CSS pixels
    // The placeholder element uses mm units, which the browser converts to CSS pixels
    // We need to convert mm to CSS pixels (not 300 DPI pixels!)
    // At standard screen DPI (96 DPI): 1mm = 96/25.4 = 3.7795275591 CSS pixels
    const mmToCssPx = 96 / 25.4;
    const placeholderWidthPx = this.pictureWidth * mmToCssPx;
    const placeholderHeightPx = (this.placeholderShape === 'round' ? this.pictureWidth : this.pictureHeight) * mmToCssPx;

    // Calculate scale based on allowWhitespace setting
    const scaleX = placeholderWidthPx / placeholder.imageWidth;
    const scaleY = placeholderHeightPx / placeholder.imageHeight;

    let fitScale: number;
    if (this.allowWhitespace) {
      // Use 'contain' behavior: fit entire image, may show whitespace
      fitScale = Math.min(scaleX, scaleY);
    } else {
      // Use 'cover' behavior: fill entire placeholder, may crop image
      fitScale = Math.max(scaleX, scaleY);
    }

    // With transform-origin: top left, we need to center the image manually
    const scaledImageWidth = placeholder.imageWidth * fitScale;
    const scaledImageHeight = placeholder.imageHeight * fitScale;

    placeholder.offsetX = (placeholderWidthPx - scaledImageWidth) / 2;
    placeholder.offsetY = (placeholderHeightPx - scaledImageHeight) / 2;
    placeholder.scale = fitScale;
  }

  clearImage(event: Event, placeholder: PlaceholderState) {
    event.stopPropagation();
    placeholder.imageData = null;
    placeholder.offsetX = 0;
    placeholder.offsetY = 0;
    placeholder.scale = 1;
    placeholder.imageWidth = 0;
    placeholder.imageHeight = 0;
  }

  resetImage(event: Event, placeholder: PlaceholderState) {
    event.stopPropagation();

    // Only reset if there's an image
    if (!placeholder.imageData || !placeholder.imageWidth || !placeholder.imageHeight) {
      return;
    }

    // Use the same logic as when loading an image
    this.fitImageToPlaceholder(placeholder);
  }

  // Image dragging handlers
  onImageMouseDown(event: MouseEvent, placeholder: PlaceholderState) {
    // Only start dragging if there's an image
    if (!placeholder.imageData) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    // Initialize drag state
    this.dragState = {
      active: true,
      placeholderId: placeholder.id,
      startX: event.clientX,
      startY: event.clientY,
      startOffsetX: placeholder.offsetX,
      startOffsetY: placeholder.offsetY
    };

    placeholder.isDraggingImage = true;
  }

  private onMouseMove(event: MouseEvent) {
    if (!this.dragState.active || this.dragState.placeholderId === null) {
      return;
    }

    // Find the placeholder being dragged
    const placeholder = this.placeholders.find(p => p.id === this.dragState.placeholderId);
    if (!placeholder) {
      return;
    }

    // Calculate delta from drag start
    const deltaX = event.clientX - this.dragState.startX;
    const deltaY = event.clientY - this.dragState.startY;

    // Calculate new offset
    let newOffsetX = this.dragState.startOffsetX + deltaX;
    let newOffsetY = this.dragState.startOffsetY + deltaY;

    // If whitespace is not allowed, constrain the image position
    if (!this.allowWhitespace) {
      newOffsetX = this.constrainOffset(newOffsetX, placeholder, 'x');
      newOffsetY = this.constrainOffset(newOffsetY, placeholder, 'y');
    }

    // Update image offset
    placeholder.offsetX = newOffsetX;
    placeholder.offsetY = newOffsetY;
  }

  private constrainOffset(offset: number, placeholder: PlaceholderState, axis: 'x' | 'y'): number {
    // Get the actual placeholder dimensions in CSS pixels
    const mmToCssPx = 96 / 25.4;
    const placeholderWidthPx = this.pictureWidth * mmToCssPx;
    const placeholderHeightPx = this.pictureHeight * mmToCssPx;

    // Calculate the scaled image dimensions
    const scaledImageWidth = placeholder.imageWidth * placeholder.scale;
    const scaledImageHeight = placeholder.imageHeight * placeholder.scale;

    if (axis === 'x') {
      // If the image is smaller than the placeholder, center it
      if (scaledImageWidth <= placeholderWidthPx) {
        return (placeholderWidthPx - scaledImageWidth) / 2;
      }

      // With transform-origin: top left, the image positioning is straightforward:
      // The left edge is at: offsetX
      // The right edge is at: offsetX + scaledImageWidth

      // To prevent whitespace on the left: offsetX <= 0
      const maxOffset = 0;

      // To prevent whitespace on the right: offsetX + scaledImageWidth >= placeholderWidthPx
      // So: offsetX >= placeholderWidthPx - scaledImageWidth (this will be negative for larger images)
      const minOffset = placeholderWidthPx - scaledImageWidth;

      // Clamp the offset
      return Math.max(minOffset, Math.min(maxOffset, offset));
    } else {
      // If the image is smaller than the placeholder, center it
      if (scaledImageHeight <= placeholderHeightPx) {
        return (placeholderHeightPx - scaledImageHeight) / 2;
      }

      // With transform-origin: top left, the image positioning is straightforward:
      // The top edge is at: offsetY
      // The bottom edge is at: offsetY + scaledImageHeight

      // To prevent whitespace on the top: offsetY <= 0
      const maxOffset = 0;

      // To prevent whitespace on the bottom: offsetY + scaledImageHeight >= placeholderHeightPx
      // So: offsetY >= placeholderHeightPx - scaledImageHeight (this will be negative for larger images)
      const minOffset = placeholderHeightPx - scaledImageHeight;

      // Clamp the offset
      return Math.max(minOffset, Math.min(maxOffset, offset));
    }
  }

  private onMouseUp(event: MouseEvent) {
    if (this.dragState.active && this.dragState.placeholderId !== null) {
      const placeholder = this.placeholders.find(p => p.id === this.dragState.placeholderId);
      if (placeholder) {
        placeholder.isDraggingImage = false;
      }
    }

    // Reset drag state
    this.dragState = {
      active: false,
      placeholderId: null,
      startX: 0,
      startY: 0,
      startOffsetX: 0,
      startOffsetY: 0
    };
  }

  // Mouse wheel zoom handler
  onWheel(event: WheelEvent, placeholder: PlaceholderState) {
    // Only zoom if there's an image
    if (!placeholder.imageData) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    // Get the placeholder element to calculate mouse position relative to it
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();

    // Calculate mouse position relative to placeholder
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // Calculate zoom factor (1.1 for zoom in, 1/1.1 for zoom out)
    const zoomFactor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
    const oldScale = placeholder.scale;
    let newScale = oldScale * zoomFactor;

    // If whitespace is not allowed, enforce minimum scale
    if (!this.allowWhitespace) {
      const minScale = this.calculateMinimumScale(placeholder);
      newScale = Math.max(minScale, newScale);
    }

    // Calculate the point under the mouse in the image coordinate space (before zoom)
    const imageX = (mouseX - placeholder.offsetX) / oldScale;
    const imageY = (mouseY - placeholder.offsetY) / oldScale;

    // Calculate new offset to keep the point under the mouse stationary
    let newOffsetX = mouseX - imageX * newScale;
    let newOffsetY = mouseY - imageY * newScale;

    // Update scale first so constrainOffset can use it
    placeholder.scale = newScale;

    // If whitespace is not allowed, constrain the image position after zooming
    if (!this.allowWhitespace) {
      newOffsetX = this.constrainOffset(newOffsetX, placeholder, 'x');
      newOffsetY = this.constrainOffset(newOffsetY, placeholder, 'y');
    }

    // Update placeholder state
    placeholder.offsetX = newOffsetX;
    placeholder.offsetY = newOffsetY;
  }

  private calculateMinimumScale(placeholder: PlaceholderState): number {
    // Get the actual placeholder dimensions in CSS pixels
    const mmToCssPx = 96 / 25.4;
    const placeholderWidthPx = this.pictureWidth * mmToCssPx;
    const placeholderHeightPx = (this.placeholderShape === 'round' ? this.pictureWidth : this.pictureHeight) * mmToCssPx;

    // Calculate minimum scale needed to cover the placeholder completely
    // The image must be at least as wide and as tall as the placeholder
    const minScaleX = placeholderWidthPx / placeholder.imageWidth;
    const minScaleY = placeholderHeightPx / placeholder.imageHeight;

    // Use the larger of the two to ensure both dimensions are covered
    return Math.max(minScaleX, minScaleY);
  }

  toggleDarkMode(): void {
    this.isDarkMode.update(value => !value);
    this.storageService.setDarkMode(this.isDarkMode());
  }

  /**
   * Save all current settings to localStorage
   */
  private saveSettings(): void {
    this.storageService.saveSettings({
      selectedPaperSizeIndex: this.selectedPaperSizeIndex,
      pictureWidth: this.pictureWidth,
      pictureHeight: this.pictureHeight,
      margins: this.margins,
      spacing: this.spacing,
      allowWhitespace: this.allowWhitespace,
      showCropMarks: this.showCropMarks,
      isDarkMode: this.isDarkMode(),
      placeholderShape: this.placeholderShape
    });
  }

  /**
   * Restore all settings to default values, but keep dark mode preference
   */
  restoreSettings(): void {
    // Reset all settings to defaults
    this.selectedPaperSizeIndex = 0;
    this.selectedPaperSize = this.paperSizes[0];
    this.pictureWidth = 44;
    this.pictureHeight = 44;
    this.margins = 4;
    this.spacing = 2;
    this.allowWhitespace = false;
    this.showCropMarks = true;
    this.placeholderShape = 'rectangular';

    this.calculateGrid();
    this.updatePrintStyles();

    // Save settings (which will include dark mode preference)
    this.saveSettings();
  }

  /**
   * Clear all pictures from all placeholders
   */
  clearAllPictures(): void {
    this.placeholders.forEach(placeholder => {
      placeholder.imageData = null;
      placeholder.offsetX = 0;
      placeholder.offsetY = 0;
      placeholder.scale = 1;
      placeholder.imageWidth = 0;
      placeholder.imageHeight = 0;
    });
  }
}
