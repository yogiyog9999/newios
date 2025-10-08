import { Component } from '@angular/core';
import { ReviewService } from '../../services/review.service';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import { ToastController, LoadingController } from '@ionic/angular';
import { supabase } from '../../services/supabase.client';

@Component({
  standalone: false,
  selector: 'app-review-new',
  templateUrl: './review-new.page.html',
  styleUrls: ['./review-new.page.scss']
})
export class ReviewNewPage {
  homeowner_name = '';
  project_type = '';
  address = '';
  zip = '';
  project_date = '';
  comments = '';
  files: File[] = [];
  me: any;
  services: any[] = [];

  ratingCategories = [
    { key: 'rating_payment', label: 'Payment Timeliness', model: 0 },
    { key: 'rating_communication', label: 'Communication', model: 0 },
    { key: 'rating_scope', label: 'Scope Clarity', model: 0 },
    { key: 'rating_change_orders', label: 'Change Order Fairness', model: 0 },
    { key: 'rating_overall', label: 'Overall Experience', model: 0 }
  ];

  constructor(
    private reviewSvc: ReviewService,
    private auth: AuthService,
    private router: Router,
    private toastCtrl: ToastController,
    private loadingCtrl: LoadingController
  ) {}

  async ngOnInit() {
    try {
      this.services = await this.reviewSvc.getServices();
    } catch (err) {
      console.error('Failed to load services:', err);
    }
  }

  async presentToast(message: string, color: string = 'success') {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2500,
      color,
    });
    toast.present();
  }

  async submit() {
    this.me = await this.auth.currentUser();
    if (!this.me) {
      this.presentToast('Not logged in', 'danger');
      return;
    }

    if (!this.homeowner_name || !this.address || !this.zip || !this.project_type) {
      this.presentToast('Please fill all required fields', 'danger');
      return;
    }

    const loading = await this.loadingCtrl.create({
      message: 'Submitting review...',
      spinner: 'crescent',
    });
    await loading.present();

    try {
      // Build review object dynamically from ratingCategories
      const review: any = {
        contractor_id: this.me.id,
        homeowner_name: this.homeowner_name,
        address: this.address,
        zip: this.zip,
        project_type: this.project_type,
        project_date: this.project_date || null,
        comments: this.comments,
      };

      this.ratingCategories.forEach(cat => {
        review[cat.key] = cat.model;
      });

      review.auto_flag = this.ratingCategories.some(r => r.model <= 2);

      // upload files
      const uploadedUrls: string[] = [];
      for (const file of this.files) {
        const ext = file.name.split('.').pop();
        const path = `reviews/${this.me.id}_${Date.now()}.${ext}`;
        const { error } = await supabase.storage.from('profile-images').upload(path, file, { upsert: true });
        if (error) throw error;

        const { data } = supabase.storage.from('profile-images').getPublicUrl(path);
        uploadedUrls.push(data.publicUrl);
      }

      await this.reviewSvc.submitReview({ ...review, files: uploadedUrls });
      this.router.navigateByUrl('/tabs/thanks', { replaceUrl: true });
    } catch (e: any) {
      this.presentToast(e.message || 'Failed to submit review', 'danger');
    } finally {
      loading.dismiss();
    }
  }

  onFileChange(ev: any) {
    this.files = Array.from(ev.target.files || []);
  }
}
