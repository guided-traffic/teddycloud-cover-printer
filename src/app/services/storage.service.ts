import { Injectable } from '@angular/core';

export interface AppSettings {
  selectedPaperSizeIndex: number;
  pictureWidth: number;
  pictureHeight: number;
  margins: number;
  spacing: number;
  allowWhitespace: boolean;
  showCropMarks: boolean;
  isDarkMode: boolean;
  placeholderShape: 'rectangular' | 'round';
}

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  private readonly SETTINGS_KEY = 'teddycloud-cover-printer-settings';
  private readonly DARK_MODE_KEY = 'teddycloud-cover-printer-dark-mode';

  // Default settings
  private readonly DEFAULT_SETTINGS: AppSettings = {
    selectedPaperSizeIndex: 0,
    pictureWidth: 44,
    pictureHeight: 44,
    margins: 4,
    spacing: 2,
    allowWhitespace: false,
    showCropMarks: true,
    isDarkMode: false,
    placeholderShape: 'rectangular'
  };

  /**
   * Retrieve all settings from localStorage
   * Returns default settings if none are stored
   */
  loadSettings(): AppSettings {
    try {
      const stored = localStorage.getItem(this.SETTINGS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Merge with defaults to handle new settings added in future versions
        return { ...this.DEFAULT_SETTINGS, ...parsed };
      }
    } catch (error) {
      console.warn('Failed to load settings from localStorage:', error);
    }
    return { ...this.DEFAULT_SETTINGS };
  }

  /**
   * Save all settings to localStorage
   */
  saveSettings(settings: AppSettings): void {
    try {
      localStorage.setItem(this.SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      console.warn('Failed to save settings to localStorage:', error);
    }
  }

  /**
   * Get dark mode preference from localStorage
   */
  getDarkMode(): boolean {
    try {
      const stored = localStorage.getItem(this.DARK_MODE_KEY);
      if (stored !== null) {
        return stored === 'true';
      }
    } catch (error) {
      console.warn('Failed to load dark mode preference:', error);
    }
    return this.DEFAULT_SETTINGS.isDarkMode;
  }

  /**
   * Save dark mode preference to localStorage
   */
  setDarkMode(isDarkMode: boolean): void {
    try {
      localStorage.setItem(this.DARK_MODE_KEY, isDarkMode.toString());
    } catch (error) {
      console.warn('Failed to save dark mode preference:', error);
    }
  }

  /**
   * Clear all stored settings and preferences
   */
  clearStorage(): void {
    try {
      localStorage.removeItem(this.SETTINGS_KEY);
      localStorage.removeItem(this.DARK_MODE_KEY);
    } catch (error) {
      console.warn('Failed to clear storage:', error);
    }
  }
}
