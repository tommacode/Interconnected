fetch('/api/Me', {
    method: 'GET',
}).then(function (response) {
    if (response.status === 200) {
        return response.json();
    }
}).then(function (data) {
    if (data) {
        document.getElementById("AccountName").innerHTML = data.Firstname + " " + data.Surname;
        document.getElementById("Plan").innerHTML = data.Plan + " Plan";
    }
}).catch(function (error) {
    console.log(error);
});