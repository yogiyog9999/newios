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
filteredCities: string[] = [];
  states = [
  { name: 'California', cities: ['Los Angeles', 'San Francisco', 'San Diego', 'Sacramento', 'San Jose'] },
  { name: 'Texas', cities: ['Houston', 'Dallas', 'Austin', 'San Antonio', 'Fort Worth'] },
  { name: 'Florida', cities: ['Miami', 'Orlando', 'Tampa', 'Jacksonville', 'Tallahassee'] },
  { name: 'New York', cities: ['New York City', 'Buffalo', 'Rochester', 'Albany', 'Syracuse'] },
  { name: 'Illinois', cities: ['Chicago', 'Springfield', 'Peoria', 'Rockford', 'Naperville'] },
  { name: 'Ohio', cities: ['Columbus', 'Cleveland', 'Cincinnati', 'Toledo', 'Akron'] },
  { name: 'Pennsylvania', cities: ['Philadelphia', 'Pittsburgh', 'Allentown', 'Erie', 'Scranton'] },
  { name: 'Georgia', cities: ['Atlanta', 'Savannah', 'Augusta', 'Columbus', 'Macon'] },
  { name: 'North Carolina', cities: ['Charlotte', 'Raleigh', 'Greensboro', 'Durham', 'Winston-Salem'] },
  { name: 'Washington', cities: ['Seattle', 'Spokane', 'Tacoma', 'Vancouver', 'Bellevue'] },
  { name: 'Colorado', cities: ['Denver', 'Colorado Springs', 'Aurora', 'Fort Collins', 'Boulder'] },
  { name: 'Michigan', cities: ['Detroit', 'Grand Rapids', 'Ann Arbor', 'Lansing', 'Flint'] },
  { name: 'Arizona', cities: ['Phoenix', 'Tucson', 'Mesa', 'Scottsdale', 'Tempe'] },
  { name: 'Massachusetts', cities: ['Boston', 'Cambridge', 'Worcester', 'Springfield', 'Lowell'] },
  { name: 'Nevada', cities: ['Las Vegas', 'Reno', 'Henderson', 'Carson City', 'Sparks'] }
];
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

    this.autocomplete.addListener('place_changed', () => {
      this.ngZone.run(() => {
        const place = this.autocomplete.getPlace();
        if (place && place.formatted_address) {
          this.address = place.formatted_address;

          // Extract ZIP if available
          const zipComponent = place.address_components?.find((c: any) =>
            c.types.includes('postal_code')
          );
          if (zipComponent) this.zip = zipComponent.long_name;

          // ✅ Extract latitude and longitude
          if (place.geometry && place.geometry.location) {
            this.lat = place.geometry.location.lat();
            this.lng = place.geometry.location.lng();
          }
        }
      });
    });
  });
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
		lat: this.lat,
        lng: this.lng,
		state: this.selectedState,
		city: this.selectedCity
      };

      this.ratingCategories.forEach(cat => {
        review[cat.key] = cat.model;
      });

      review.auto_flag = this.ratingCategories.some(r => r.model <= 2);

      // Upload files to Supabase
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
  onStateChange(event: any) {
  const selectedState = event.detail.value;
  const stateData = this.states.find(s => s.name === selectedState);
  this.filteredCities = stateData ? stateData.cities : [];
  this.selectedCity = '';
}
}
