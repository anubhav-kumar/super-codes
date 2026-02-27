defmodule LiveBettingWeb.WindowLive.Form do
  use LiveBettingWeb, :live_view

  alias LiveBetting.Matches
  alias LiveBetting.Matches.Window

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <.header>
        {@page_title}
        <:subtitle>Use this form to manage window records in your database.</:subtitle>
      </.header>

      <.form for={@form} id="window-form" phx-change="validate" phx-submit="save">
        <.input field={@form[:sequence_number]} type="number" label="Sequence number" />
        <.input field={@form[:opens_at]} type="datetime-local" label="Opens at" />
        <.input field={@form[:closes_at]} type="datetime-local" label="Closes at" />
        <.input field={@form[:duration_seconds]} type="number" label="Duration seconds" />
        <.input field={@form[:status]} type="text" label="Status" />
        <.input field={@form[:resolution_type]} type="text" label="Resolution type" />
        <.input field={@form[:winning_team]} type="text" label="Winning team" />
        <.input field={@form[:house_takeout_pct]} type="number" label="House takeout pct" step="any" />
        <footer>
          <.button phx-disable-with="Saving..." variant="primary">Save Window</.button>
          <.button navigate={return_path(@return_to, @window)}>Cancel</.button>
        </footer>
      </.form>
    </Layouts.app>
    """
  end

  @impl true
  def mount(params, _session, socket) do
    {:ok,
     socket
     |> assign(:return_to, return_to(params["return_to"]))
     |> apply_action(socket.assigns.live_action, params)}
  end

  defp return_to("show"), do: "show"
  defp return_to(_), do: "index"

  defp apply_action(socket, :edit, %{"id" => id}) do
    window = Matches.get_window!(id)

    socket
    |> assign(:page_title, "Edit Window")
    |> assign(:window, window)
    |> assign(:form, to_form(Matches.change_window(window)))
  end

  defp apply_action(socket, :new, _params) do
    window = %Window{}

    socket
    |> assign(:page_title, "New Window")
    |> assign(:window, window)
    |> assign(:form, to_form(Matches.change_window(window)))
  end

  @impl true
  def handle_event("validate", %{"window" => window_params}, socket) do
    changeset = Matches.change_window(socket.assigns.window, window_params)
    {:noreply, assign(socket, form: to_form(changeset, action: :validate))}
  end

  def handle_event("save", %{"window" => window_params}, socket) do
    save_window(socket, socket.assigns.live_action, window_params)
  end

  defp save_window(socket, :edit, window_params) do
    case Matches.update_window(socket.assigns.window, window_params) do
      {:ok, window} ->
        {:noreply,
         socket
         |> put_flash(:info, "Window updated successfully")
         |> push_navigate(to: return_path(socket.assigns.return_to, window))}

      {:error, %Ecto.Changeset{} = changeset} ->
        {:noreply, assign(socket, form: to_form(changeset))}
    end
  end

  defp save_window(socket, :new, window_params) do
    case Matches.create_window(window_params) do
      {:ok, window} ->
        {:noreply,
         socket
         |> put_flash(:info, "Window created successfully")
         |> push_navigate(to: return_path(socket.assigns.return_to, window))}

      {:error, %Ecto.Changeset{} = changeset} ->
        {:noreply, assign(socket, form: to_form(changeset))}
    end
  end

  defp return_path("index", _window), do: ~p"/windows"
  defp return_path("show", window), do: ~p"/windows/#{window}"
end
