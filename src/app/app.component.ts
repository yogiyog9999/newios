import { Component } from '@angular/core';
import { supabase } from './services/supabase.client';
import { PushService } from './services/push.service';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Platform, NavController } from '@ionic/angular';  
import { Device } from '@capacitor/device';
import { App as CapacitorApp } from '@capacitor/app'; // <-- add this

@Component({
  standalone: false,
  selector: 'app-root',
  template: `
    <ion-app>
      <ion-router-outlet></ion-router-outlet>
    </ion-app>
  `
})
export class AppComponent {
  constructor(
    private pushService: PushService,
    private platform: Platform,
    private navCtrl: NavController
  ) {
    this.pushService.init(); // register push on startup
    this.initializeApp();
    this.handleDeepLinks(); // <-- listen for deep links
  }

  async initializeApp() {
    await this.platform.ready();

    // ✅ Status bar overlay ON
    await StatusBar.setOverlaysWebView({ overlay: true });
    await StatusBar.setStyle({ style: Style.Light });
    await StatusBar.setBackgroundColor({ color: '#4267B2' });

    // ✅ Safe area
    const info = await Device.getInfo();
    document.documentElement.style.setProperty('--status-bar-height', 'env(safe-area-inset-top)');

    // ✅ Auth check
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error) {
      console.error('Auth check failed:', error.message);
      this.navCtrl.navigateRoot('/auth/login');
      return;
    }

    if (user) {
      this.navCtrl.navigateRoot('/tabs/dashboard');
    } else {
      this.navCtrl.navigateRoot('/auth/login');
    }
  }

 handleDeepLinks() {
  CapacitorApp.addListener('appUrlOpen', (data: any) => {
    console.log('Deep link opened:', data.url);

    // Example data.url:
    // dlist://reset-password#access_token=eyJhbGci...&type=recovery
    const url = new URL(data.url.replace('dlist://', 'https://dummy.com/'));
    const hash = url.hash; // #access_token=...&type=recovery

    if (url.pathname === '/reset-password' && hash) {
      // Pass hash to your reset-password page via query params
      const queryParams = new URLSearchParams(hash.substring(1));
      const accessToken = queryParams.get('access_token');
      const type = queryParams.get('type');

      if (type === 'recovery' && accessToken) {
        // Set the session in Supabase
        supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: queryParams.get('refresh_token') || ''
        });

        // Navigate to reset-password page
        this.navCtrl.navigateForward('/reset-password');
      }
    }
  });
}

}
