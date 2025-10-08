import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastController, LoadingController } from '@ionic/angular';
import { ReviewService } from '../../services/review.service';
import { supabase } from '../../services/supabase.client';

@Component({
  standalone: false,
  selector: 'app-editreview',
  templateUrl: './editreview.page.html',
  styleUrls: ['./editreview.page.scss']
})
export class EditreviewPage implements OnInit {
  reviewId!: string; // UUID

  homeowner_name = '';
  project_type = '';
  address = '';
  zip = '';
  project_date: string | null = null;
  comments = '';
  files: File[] = []; // newly selected files
  existingFiles: { name: string; url: string }[] = []; // preloaded files
  services: any[] = [];

  ratingCategories = [
    { key: 'rating_payment', label: 'Payment Timeliness', model: 0 },
    { key: 'rating_communication', label: 'Communication', model: 0 },
    { key: 'rating_scope', label: 'Scope Clarity', model: 0 },
    { key: 'rating_change_orders', label: 'Change Order Fairness', model: 0 },
    { key: 'rating_overall', label: 'Overall Experience', model: 0 }
  ];

  constructor(
    private route: ActivatedRoute,
    private reviewSvc: ReviewService,
    private router: Router,
    private toastCtrl: ToastController,
    private loadingCtrl: LoadingController
  ) {}

  async ngOnInit() {
    this.reviewId = this.route.snapshot.paramMap.get('id')!; // UUID

    try {
      // Load services
      this.services = await this.reviewSvc.getServices();

      // Load review row
      const { data: existingRows, error: fetchErr } = await supabase
        .from('reviews')
        .select('*')
        .eq('id', this.reviewId);

      if (fetchErr) throw fetchErr;
      if (!existingRows || existingRows.length === 0) {
        this.presentToast('Review not found', 'danger');
        this.router.navigateByUrl('/tabs/myreview');
        return;
      }

      const review = existingRows[0];

      // Populate form fields
      this.homeowner_name = review.homeowner_name;
      this.project_type = review.project_type;
      this.address = review.address;
      this.zip = review.zip;
      this.project_date = review.project_date;
      this.comments = review.comments;

      this.ratingCategories.forEach(cat => {
        cat.model = review[cat.key] || 0;
      });

      // Load existing files from JSON
      if (review.files) {
        try {
          const parsedFiles: string[] = JSON.parse(review.files);
          if (Array.isArray(parsedFiles)) {
            this.existingFiles = parsedFiles.map(url => ({
              name: url.split('/').pop() || 'file',
              url
            }));
          }
        } catch (err) {
          console.error('Failed to parse files JSON:', err);
        }
      }
    } catch (err) {
      console.error('Failed to load review:', err);
      this.presentToast('Failed to load review', 'danger');
    }
  }

  onFileChange(ev: any) {
    this.files = Array.from(ev.target.files || []);
  }

  async deleteFile(file: { name: string; url: string }) {
    const confirmDelete = window.confirm(`Delete "${file.name}"?`);
    if (!confirmDelete) return;

    this.existingFiles = this.existingFiles.filter(f => f.url !== file.url);
    this.presentToast(`File "${file.name}" removed`);
  }

  async update() {
    const loading = await this.loadingCtrl.create({ message: 'Updating review...', spinner: 'crescent' });
    await loading.present();

    try {
      // Fetch current row for comparison
      const { data: existingRows, error: fetchErr } = await supabase
        .from('reviews')
        .select('*')
        .eq('id', this.reviewId);

      if (fetchErr) throw fetchErr;
      if (!existingRows || existingRows.length === 0) {
        throw new Error('Review not found');
      }

      const existing = existingRows[0];

      // Upload new files
      const newFilesUrls: string[] = [];
      for (const file of this.files) {
        const path = `reviews/${this.reviewId}_${Date.now()}_${file.name}`;
        const { error: uploadErr } = await supabase.storage
          .from('profile-images')
          .upload(path, file, { upsert: true });
        if (uploadErr) throw uploadErr;

        const { data: urlData } = supabase.storage
          .from('profile-images')
          .getPublicUrl(path);
        newFilesUrls.push(urlData.publicUrl);
      }

      const finalFiles = [...this.existingFiles.map(f => f.url), ...newFilesUrls];

      // Build full payload
      const updates: any = {
        homeowner_name: this.homeowner_name,
        project_type: this.project_type,
        address: this.address,
        zip: this.zip,
        project_date: this.project_date || null,
        comments: this.comments,
        files: JSON.stringify(finalFiles)
      };

      this.ratingCategories.forEach(cat => {
        updates[cat.key] = cat.model;
      });

      console.log('Update payload:', updates);

      // Call service
      const updatedRow = await this.reviewSvc.updateReview(this.reviewId, updates);
      console.log('Updated row:', updatedRow);

      this.presentToast('Review updated successfully');
      this.router.navigateByUrl('/tabs/myreview', { replaceUrl: true });
    } catch (err: any) {
      console.error('Update failed:', err);
      this.presentToast(err.message || 'Update failed', 'danger');
    } finally {
      loading.dismiss();
    }
  }

  async presentToast(message: string, color: string = 'success') {
    const toast = await this.toastCtrl.create({ message, duration: 2500, color });
    toast.present();
  }
}
