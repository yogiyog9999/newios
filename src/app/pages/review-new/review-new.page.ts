import { Component, NgZone, ViewChild, AfterViewInit } from '@angular/core';
import { IonInput, ToastController, LoadingController } from '@ionic/angular';
import { ReviewService } from '../../services/review.service';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import { supabase } from '../../services/supabase.client';

declare var google: any;

@Component({
  standalone: false,
  selector: 'app-review-new',
  templateUrl: './review-new.page.html',
  styleUrls: ['./review-new.page.scss']
})
export class ReviewNewPage implements AfterViewInit {
  @ViewChild('autocompleteAddress', { static: false }) autocompleteInput!: IonInput;
  stateList: string[] = [
    'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado',
    'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho',
    'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana',
    'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota',
    'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada',
    'New Hampshire', 'New Jersey', 'New Mexico', 'New York',
    'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon',
    'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
    'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington',
    'West Virginia', 'Wisconsin', 'Wyoming'
  ]; 
  homeowner_name = '';
  project_type = '';
  address = '';
  zip = '';
  project_date = '';
  comments = '';
  files: File[] = [];
  me: any;
  services: any[] = [];
  autocomplete: any;
  lat: number | null = null;
  lng: number | null = null;
  selectedState: string = '';
  selectedCity: string = '';

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
    private loadingCtrl: LoadingController,
    private ngZone: NgZone
  ) {}

  async ngOnInit() {
    try {
      this.services = await this.reviewSvc.getServices();
    } catch (err) {
      console.error('Failed to load services:', err);
    }
  }

  ngAfterViewInit() {
    this.initAutocomplete();
  }

  initAutocomplete() {
    this.autocompleteInput.getInputElement().then((inputEl: HTMLInputElement) => {
      this.autocomplete = new google.maps.places.Autocomplete(inputEl, {
        types: ['address'],
        componentRestrictions: { country: 'us' }
      });

      // When user selects an autocomplete suggestion
      this.autocomplete.addListener('place_changed', () => {
        this.ngZone.run(() => {
          const place = this.autocomplete.getPlace();
          if (place && place.formatted_address) {
            this.extractAddressComponents(place, true);
          }
        });
      });

      // When user manually types and leaves field
      inputEl.addEventListener('blur', () => {
        const enteredAddress = inputEl.value.trim();
        if (enteredAddress) {
          // Always geocode on blur, so manual typing works
          this.geocodeManualAddress(enteredAddress);
        }
      });
    });
  }

  extractAddressComponents(place: any, overwriteAddress = true) {
    if (overwriteAddress && place.formatted_address) {
      this.address = place.formatted_address;
    }

    const components = place.address_components || [];
    const getComp = (type: string) =>
      components.find((c: any) => c.types.includes(type))?.long_name || '';

    this.zip = getComp('postal_code');
    this.selectedCity = getComp('locality') || getComp('sublocality') || '';

    // Extract and normalize state name
    const stateRaw = getComp('administrative_area_level_1') || '';
    if (stateRaw) {
      const matchedState = this.stateList.find(
        s => s.toLowerCase() === stateRaw.toLowerCase()
      );
      if (matchedState) {
        this.selectedState = matchedState; // ✅ Auto-select matching state
      } else {
        this.selectedState = ''; // allow manual select if mismatch
      }
    }

    if (place.geometry && place.geometry.location) {
      this.lat = place.geometry.location.lat();
      this.lng = place.geometry.location.lng();
    }
  }



  geocodeManualAddress(address: string) {
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode(
      {
        address,
        region: 'US',
        componentRestrictions: { country: 'us' }
      },
      (results: any, status: any) => {
        if (status === 'OK' && results && results.length > 0) {
          this.ngZone.run(() => {
            // Keep the user's typed address — don’t overwrite it
            this.extractAddressComponents(results[0], false);
          });
        } else {
          console.warn('Manual geocode failed:', status);
        }
      }
    );
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
    const unRated = this.ratingCategories.some(cat => cat.model === 0);
if (unRated) {
  this.presentToast('Please rate all categories before submitting', 'danger');
  return;
}
    const loading = await this.loadingCtrl.create({
      message: 'Submitting review...',
      spinner: 'crescent',
    });
    await loading.present();

    try {
      const review: any = {
        contractor_id: this.me.id,
        homeowner_name: this.homeowner_name,
        address: this.address,
        zip: this.zip,
        project_type: this.project_type,
        project_date: this.project_date || null,
        comments: this.comments,
        lat: this.lat,
        lng: this.lng,
        state: this.selectedState,
        city: this.selectedCity
      };

      this.ratingCategories.forEach(cat => {
        review[cat.key] = cat.model;
      });

      review.auto_flag = this.ratingCategories.some(r => r.model <= 2);

      const uploadedUrls: string[] = [];
      for (const file of this.files) {
        const ext = file.name.split('.').pop();
        const path = `reviews/${this.me.id}_${Date.now()}.${ext}`;
        const { error } = await supabase.storage
          .from('profile-images')
          .upload(path, file, { upsert: true });
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
