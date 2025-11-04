import { Injectable } from '@angular/core';
import { Platform } from '@ionic/angular';
import { PushNotifications, Token } from '@capacitor/push-notifications';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { supabase } from './supabase.client';

@Injectable({ providedIn: 'root' })
export class PushService {
  constructor(private platform: Platform) {}

  async init() {
    await this.platform.ready();

    try {
      // ✅ Ensure Firebase is initialized before push
      await FirebaseMessaging.requestPermissions();
      const fcmToken = await FirebaseMessaging.getToken();
      console.log('✅ FCM Token:', fcmToken.token);

      const { data } = await supabase.auth.getUser();
      if (data.user) {
        await this.saveToken(data.user.id, fcmToken.token);
      }

      // ✅ Set up listeners
      PushNotifications.addListener('registrationError', (err) => {
        console.error('❌ Push registration error:', err);
      });

    } catch (err) {
      console.error('🔥 Push init failed:', err);
    }
  }

  async saveToken(userId: string, fcmToken: string) {
    const { error } = await supabase
      .from('user_tokens')
      .upsert(
        {
          user_id: userId,
          fcm_token: fcmToken,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

    if (error) {
      console.error('❌ Error saving token:', error);
    } else {
      console.log('✅ Push token saved successfully!');
    }
  }

  async deleteTokens(userId: string) {
    const { error } = await supabase.from('user_tokens').delete().eq('user_id', userId);
    if (error) console.error('❌ Error deleting tokens:', error);
  }
}
