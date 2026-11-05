// Find our date picker inputs on the page
const startInput = document.getElementById('startDate');
const endInput = document.getElementById('endDate');
const getImagesButton = document.getElementById('getImagesButton');
const gallery = document.getElementById('gallery');
const spaceFact = document.getElementById('spaceFact');
const photoModal = document.getElementById('photoModal');
const closeModalButton = document.getElementById('closeModalButton');
const modalImage = document.getElementById('modalImage');
const modalTitle = document.getElementById('modalTitle');
const modalDate = document.getElementById('modalDate');
const modalExplanation = document.getElementById('modalExplanation');

// DEMO_KEY is fine for trying the API. Replace it with your own key from api.nasa.gov.
const apiKey = 'DEMO_KEY';

// Choose a new space fact each time the page loads.
const spaceFacts = [
	'The Sun contains about 99.8% of the total mass of our solar system.',
	'One day on Venus is longer than one year on Venus.',
	'Jupiter has the shortest day of all the planets in our solar system.',
	'Neutron stars can spin hundreds of times every second.',
	'Footprints left by astronauts on the Moon can last for millions of years.',
	'Light from the Sun takes about eight minutes to reach Earth.'
];
spaceFact.textContent = spaceFacts[Math.floor(Math.random() * spaceFacts.length)];

// Call the setupDateInputs function from dateRange.js
// This sets up the date pickers to:
// - Default to a range of 9 days (from 9 days ago to today)
// - Restrict dates to NASA's image archive (starting from 1995)
setupDateInputs(startInput, endInput);

// Get APOD entries when the user clicks the button.
getImagesButton.addEventListener('click', getSpaceImages);
closeModalButton.addEventListener('click', () => photoModal.close());
photoModal.addEventListener('click', (event) => {
	if (event.target === photoModal) {
		photoModal.close();
	}
});

async function getSpaceImages() {
	const startDate = startInput.value;
	const endDate = endInput.value;

	// Make sure both dates are selected and the range is in the right order.
	if (!startDate || !endDate || startDate > endDate) {
		showMessage('Choose a valid start and end date.');
		return;
	}

	// NASA limits one APOD date-range request to 1,000 results.
	const numberOfDays = (Date.parse(endDate) - Date.parse(startDate)) / 86400000 + 1;
	if (numberOfDays > 1000) {
		showMessage('Choose a date range of 1,000 days or fewer.');
		return;
	}

	showMessage('🔄 Loading space photos…', true);

	// URLSearchParams safely adds the dates and API key to the request URL.
	const parameters = new URLSearchParams({
		start_date: startDate,
		end_date: endDate,
		thumbs: 'true',
		api_key: apiKey
	});

	try {
		const response = await fetch(`https://api.nasa.gov/planetary/apod?${parameters}`);
		const photos = await response.json();

		if (response.status === 429) {
			displayPhotos(await getCurrentAPODPhotos(startDate, endDate));
			return;
		}

		if (!response.ok || !Array.isArray(photos)) {
			throw new Error(photos.msg || photos.error?.message || 'NASA could not return APOD entries for those dates.');
		}

		const hasUnavailableImages = photos.some((photo) => (
			photo.media_type === 'image' && !getPhotoImageUrl(photo)
		));
		const galleryPhotos = hasUnavailableImages
			? await getCurrentAPODPhotos(startDate, endDate)
			: photos;

		displayPhotos(galleryPhotos);
	} catch (error) {
		showMessage(`Could not load APOD images: ${error.message}`);
	}
}

async function getCurrentAPODPhotos(startDate, endDate) {
	const dates = [];
	const currentDate = new Date(`${startDate}T00:00:00Z`);
	const lastDate = new Date(`${endDate}T00:00:00Z`);

	while (currentDate <= lastDate) {
		dates.push(currentDate.toISOString().slice(0, 10));
		currentDate.setUTCDate(currentDate.getUTCDate() + 1);
	}

	const photos = [];

	// Load small batches so long date ranges do not send too many requests at once.
	for (let index = 0; index < dates.length; index += 10) {
		const dateBatch = dates.slice(index, index + 10);
		const batchPhotos = await Promise.all(dateBatch.map(async (date) => {
			const nasaDate = date.slice(2).replaceAll('-', '');
			const response = await fetch(`https://science.nasa.gov/wp-json/wp/v2/apod-basic/${nasaDate}`);
			const photo = await response.json();

			if (!response.ok || !photo.date) {
				throw new Error(photo.message || `NASA could not return the APOD entry for ${date}.`);
			}

			return photo;
		}));

		photos.push(...batchPhotos);
	}

	return photos;
}

function displayPhotos(photos) {
	gallery.setAttribute('aria-busy', 'false');
	gallery.replaceChildren();

	const supportedPhotos = photos.filter((photo) => (
		(photo.media_type === 'image' && getPhotoImageUrl(photo)) ||
		photo.media_type === 'video'
	));

	if (supportedPhotos.length === 0) {
		const hasNASAPlaceholder = photos.some((photo) => (
			[photo.url, photo.hdurl, photo.thumbnail_url].some(isNASAPlaceholderUrl)
		));
		showMessage(hasNASAPlaceholder
			? 'NASA returned a placeholder logo instead of APOD photos. Please try again later.'
			: 'No images or videos were found for those dates.');
		return;
	}

	supportedPhotos.forEach((photo) => {
		const card = document.createElement('article');
		card.className = 'gallery-item';

		if (photo.media_type === 'image') {
			card.tabIndex = 0;
			card.setAttribute('role', 'button');
			card.setAttribute('aria-label', `View details for ${photo.title}`);
			card.addEventListener('click', () => openPhotoModal(photo));
			card.addEventListener('keydown', (event) => {
				if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault();
					openPhotoModal(photo);
				}
			});
		}

		const imageUrl = getPhotoImageUrl(photo);
		const imageFrame = document.createElement('div');
		imageFrame.className = 'gallery-image-frame';

		if (imageUrl) {
			const image = document.createElement('img');
			image.src = imageUrl;
			image.alt = photo.media_type === 'video' ? `Video thumbnail: ${photo.title}` : photo.title;
			imageFrame.appendChild(image);
		} else {
			const videoNotice = document.createElement('p');
			videoNotice.className = 'video-notice';
			videoNotice.textContent = 'NASA video';
			imageFrame.appendChild(videoNotice);
		}
		card.appendChild(imageFrame);

		const title = document.createElement('h2');
		title.textContent = photo.title;
		title.title = photo.title;
		card.appendChild(title);

		const date = document.createElement('p');
		date.textContent = photo.date;
		card.appendChild(date);

		if (photo.media_type === 'video') {
			const videoLink = document.createElement('a');
			videoLink.className = 'video-link';
			videoLink.href = photo.url;
			videoLink.target = '_blank';
			videoLink.rel = 'noopener noreferrer';
			videoLink.textContent = 'Watch this video on NASA';
			card.appendChild(videoLink);

			const detailsButton = document.createElement('button');
			detailsButton.className = 'video-details';
			detailsButton.type = 'button';
			detailsButton.textContent = 'Read explanation';
			detailsButton.addEventListener('click', () => openPhotoModal(photo));
			card.appendChild(detailsButton);
		}

		gallery.appendChild(card);
	});
}

function getPhotoImageUrl(photo) {
	const imageUrls = photo.media_type === 'image'
		? [photo.hdurl, photo.url]
		: [photo.thumbnail_url, photo.hdurl];

	return imageUrls.find((url) => url && !isNASAPlaceholderUrl(url));
}

function isNASAPlaceholderUrl(url) {
	return typeof url === 'string' &&
		/\/(?:nasa-logo(?:@2x)?|news-thumbnail)\.(?:png|jpe?g|webp)$/i.test(url.split(/[?#]/, 1)[0]);
}

function openPhotoModal(photo) {
	const imageUrl = getPhotoImageUrl(photo);
	modalImage.hidden = !imageUrl;
	if (imageUrl) {
		modalImage.src = imageUrl;
	} else {
		modalImage.removeAttribute('src');
	}
	modalImage.alt = photo.title;
	modalTitle.textContent = photo.title;
	modalDate.textContent = photo.date;
	const explanation = document.createElement('div');
	explanation.innerHTML = photo.explanation;
	modalExplanation.textContent = explanation.textContent;
	photoModal.showModal();
}

function showMessage(message, isLoading = false) {
	const messageElement = document.createElement('p');
	messageElement.className = 'placeholder';
	messageElement.textContent = message;
	gallery.setAttribute('aria-busy', String(isLoading));
	gallery.replaceChildren(messageElement);
}
